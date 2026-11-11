import jwt from 'jsonwebtoken';
import { env, slackEnabled } from '../config/env.js';
import { pool } from '../db/pool.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { log } from '../lib/logger.js';
import { HttpError } from '../lib/http.js';

/**
 * Slack via OAuth v2 with the `incoming-webhook` scope: during install the user
 * picks a channel and Slack returns a webhook URL for it. We store it encrypted
 * per user. The integration is read from the DB on every notification, so
 * connecting/disconnecting takes effect immediately, no redeploy.
 */
export const SLACK_REDIRECT_PATH = '/api/slack/callback';
const redirectUri = () => `${env.APP_URL}${SLACK_REDIRECT_PATH}`;

/** state = short-lived signed token bound to the user => CSRF protection for the OAuth flow. */
export function buildInstallUrl(userId) {
  if (!slackEnabled) throw new HttpError(400, 'Slack is not configured on this server');
  const state = jwt.sign({ uid: userId, p: 'slack' }, env.JWT_SECRET, { expiresIn: '10m' });
  const u = new URL('https://slack.com/oauth/v2/authorize');
  u.searchParams.set('client_id', env.SLACK_CLIENT_ID);
  u.searchParams.set('scope', 'incoming-webhook');
  u.searchParams.set('redirect_uri', redirectUri());
  u.searchParams.set('state', state);
  return u.toString();
}

export async function completeInstall(sessionUserId, code, state) {
  let payload;
  try {
    payload = jwt.verify(state, env.JWT_SECRET);
  } catch {
    throw new HttpError(400, 'Invalid or expired Slack state');
  }
  if (payload.p !== 'slack' || payload.uid !== sessionUserId)
    throw new HttpError(403, 'Slack state mismatch');

  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri(),
    }),
  });
  const data = await res.json();
  if (!data.ok || !data.incoming_webhook?.url) {
    throw new HttpError(400, `Slack OAuth failed: ${data.error ?? 'no webhook returned'}`);
  }
  await pool.query(
    `INSERT INTO slack_integrations (user_id, team_name, channel, webhook_enc)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE team_name = VALUES(team_name), channel = VALUES(channel),
                             webhook_enc = VALUES(webhook_enc), connected_at = NOW(3)`,
    [
      sessionUserId,
      data.team?.name ?? null,
      data.incoming_webhook.channel ?? null,
      encrypt(data.incoming_webhook.url, env.ENCRYPTION_KEY),
    ],
  );
  log.info('slack_connected', { userId: sessionUserId, team: data.team?.name });
}

export async function getStatus(userId) {
  const [rows] = await pool.query(
    'SELECT team_name, channel, connected_at FROM slack_integrations WHERE user_id = ?',
    [userId],
  );
  const r = rows[0];
  return {
    enabled: slackEnabled,
    connected: Boolean(r),
    team: r?.team_name ?? null,
    channel: r?.channel ?? null,
    connectedAt: r?.connected_at ?? null,
  };
}

export async function disconnect(userId) {
  await pool.query('DELETE FROM slack_integrations WHERE user_id = ?', [userId]);
}

/**
 * Post a message to the user's connected channel.
 *  - not connected -> no-op (never crashes the worker)
 *  - webhook revoked / channel deleted -> auto-disconnect, no-op
 *  - network / 5xx / 429 -> throw, so BullMQ retries with backoff
 */
export async function postToUser(userId, text, blocks) {
  const [rows] = await pool.query('SELECT webhook_enc FROM slack_integrations WHERE user_id = ?', [userId]);
  if (!rows[0]) return 'not_connected';
  const url = decrypt(rows[0].webhook_enc, env.ENCRYPTION_KEY);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, blocks }),
  });
  if (res.ok) return 'sent';
  const body = await res.text();
  const revoked =
    res.status === 404 ||
    res.status === 410 ||
    res.status === 403 ||
    /no_service|channel_not_found|channel_is_archived|invalid_token|no_team/.test(body);
  if (revoked) {
    await disconnect(userId);
    log.warn('slack_webhook_revoked_auto_disconnected', { userId, status: res.status, body });
    return 'revoked';
  }
  throw new Error(`Slack webhook error ${res.status}: ${body}`);
}

export function rateLimitMessage(senderEmail, limit, hour) {
  const windowStart = new Date(hour * 3_600_000);
  const windowEnd = new Date((hour + 1) * 3_600_000);
  const fmt = (d) => d.toISOString().slice(11, 16);
  const text = `⏸️ Hourly limit reached for ${senderEmail}: ${limit} emails sent in ${fmt(windowStart)}–${fmt(windowEnd)} UTC. Remaining emails were moved to the next window, nothing was dropped.`;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '⏸️ Sender hourly limit reached' } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Sender*\n${senderEmail}` },
        { type: 'mrkdwn', text: `*Limit*\n${limit}/hour` },
        { type: 'mrkdwn', text: `*Window (UTC)*\n${fmt(windowStart)}–${fmt(windowEnd)}` },
        {
          type: 'mrkdwn',
          text: `*Resumes at*\n${windowEnd.toISOString().replace('T', ' ').slice(0, 16)} UTC`,
        },
      ],
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: 'Remaining emails were rescheduled in order. Nothing was dropped.' },
      ],
    },
  ];
  return { text, blocks };
}
