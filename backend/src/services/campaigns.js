import { z } from 'zod';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { redis } from '../redis/connection.js';
import { enqueueEmails } from '../queue/queues.js';
import { createRateLimiter } from './rateLimiter.js';
import { normalizeLeads } from './leads.js';
import { htmlToText, looksLikeHtml, sanitizeHtml } from '../lib/html.js';
import { assignRoundRobin, planSendTimes } from './slotPlanner.js';
import { getOwnedSenders } from './senders.js';
import { indexEmails } from './search.js';
import { HttpError } from '../lib/http.js';
import { log, errMsg } from '../lib/logger.js';

const limiter = createRateLimiter(redis);

export const scheduleSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(998),
  body: z
    .string()
    .max(200_000)
    // editor HTML is sanitised server-side; plain text is kept as-is
    .transform((b) => (looksLikeHtml(b) ? sanitizeHtml(b) : b))
    .refine((b) => htmlToText(b).trim().length > 0, 'Body is required'),
  leads: z.array(z.string()).min(1, 'Upload at least one lead'),
  startAt: z.string().datetime({ offset: true, message: 'startAt must be an ISO datetime' }),
  delaySeconds: z.coerce.number().min(0).max(3600),
  hourlyLimit: z.coerce.number().int().min(1).max(100_000),
  senderIds: z.array(z.coerce.number().int().positive()).min(1, 'Pick at least one sender').max(20),
});

async function summaryForExisting(campaignId) {
  const [rows] = await pool.query(
    `SELECT c.id, c.total, c.hourly_limit, c.delay_ms,
            MIN(e.send_at) AS first_at, MAX(e.send_at) AS last_at
       FROM campaigns c LEFT JOIN emails e ON e.campaign_id = c.id
      WHERE c.id = ? GROUP BY c.id`,
    [campaignId],
  );
  const r = rows[0];
  return {
    campaignId,
    replayed: true,
    accepted: Number(r.total),
    duplicates: 0,
    invalid: 0,
    invalidSamples: [],
    effectiveHourlyLimit: Number(r.hourly_limit),
    effectiveDelayMs: Number(r.delay_ms),
    firstSendAt: new Date(r.first_at).toISOString(),
    lastSendAt: new Date(r.last_at).toISOString(),
    hourWindows: 0,
    perSender: [],
    warnings: ['Duplicate submit detected (same Idempotency-Key). Returned the original campaign.'],
  };
}

async function findByIdempotencyKey(userId, key) {
  const [rows] = await pool.query('SELECT id FROM campaigns WHERE user_id = ? AND idempotency_key = ?', [
    userId,
    key,
  ]);
  return rows[0]?.id;
}

/**
 * Schedule a campaign:
 *  1. validate + clean leads (dedupe, invalid emails reported back)
 *  2. rotate leads across the chosen senders
 *  3. reserve hour windows per sender in Redis (atomic Lua) => concrete send_at per email
 *  4. one DB transaction: campaign + all email rows (MySQL = source of truth)
 *  5. enqueue one delayed BullMQ job per email (jobId = email id)
 *  6. index in Elasticsearch (best effort)
 */
export async function scheduleCampaign(userId, input, idempotencyKey) {
  if (idempotencyKey) {
    const existing = await findByIdempotencyKey(userId, idempotencyKey);
    if (existing) return summaryForExisting(existing);
  }

  const warnings = [];
  const report = normalizeLeads(input.leads);
  if (report.valid.length === 0)
    throw new HttpError(400, 'No valid email addresses found', { invalid: report.invalid.slice(0, 10) });
  if (report.valid.length > env.MAX_LEADS_PER_CAMPAIGN) {
    throw new HttpError(400, `Too many leads: ${report.valid.length} (max ${env.MAX_LEADS_PER_CAMPAIGN})`);
  }

  const senderIds = [...new Set(input.senderIds)];
  const senders = await getOwnedSenders(userId, senderIds);

  const effectiveLimit = Math.min(input.hourlyLimit, env.MAX_EMAILS_PER_HOUR_PER_SENDER);
  if (effectiveLimit < input.hourlyLimit) {
    warnings.push(`Hourly limit capped at ${effectiveLimit}/sender (server maximum).`);
  }
  const effectiveDelayMs = Math.max(Math.round(input.delaySeconds * 1000), env.MIN_DELAY_BETWEEN_EMAILS_MS);
  if (effectiveDelayMs > input.delaySeconds * 1000) {
    warnings.push(`Delay raised to ${effectiveDelayMs / 1000}s (server minimum between sends).`);
  }

  const requestedStart = Date.parse(input.startAt);
  const startMs = Math.max(requestedStart, Date.now());
  if (requestedStart < Date.now() - 60_000) warnings.push('Start time was in the past; sending starts now.');

  // 2 + 3. rotate + plan
  const withSeq = report.valid.map((email, seq) => ({ email, seq }));
  const buckets = assignRoundRobin(withSeq, senders.length);
  const planned = [];
  const hours = new Set();
  for (let i = 0; i < senders.length; i++) {
    const bucket = buckets[i];
    if (!bucket.length) continue;
    const chunks = await limiter.reserve(
      senders[i].id,
      startMs,
      effectiveDelayMs,
      effectiveLimit,
      bucket.length,
    );
    chunks.forEach((c) => hours.add(c.hour));
    const times = planSendTimes(chunks, startMs, effectiveDelayMs);
    bucket.forEach((lead, k) =>
      planned.push({ ...lead, senderId: senders[i].id, sendAt: new Date(times[k]) }),
    );
  }
  planned.sort((a, b) => a.seq - b.seq);

  // 4. persist atomically
  const conn = await pool.getConnection();
  let campaignId;
  try {
    await conn.beginTransaction();
    const [c] = await conn.query(
      `INSERT INTO campaigns (user_id, subject, body, start_at, delay_ms, hourly_limit, total, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        input.subject,
        input.body,
        new Date(startMs),
        effectiveDelayMs,
        effectiveLimit,
        planned.length,
        idempotencyKey ?? null,
      ],
    );
    campaignId = c.insertId;
    for (let i = 0; i < planned.length; i += 1000) {
      const values = planned
        .slice(i, i + 1000)
        .map((p) => [campaignId, userId, p.senderId, p.seq, p.email, input.subject, p.sendAt]);
      await conn.query(
        'INSERT INTO emails (campaign_id, user_id, sender_id, seq, to_email, subject, send_at) VALUES ?',
        [values],
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    // Two identical requests raced past the idempotency check: return the winner.
    if (err.code === 'ER_DUP_ENTRY' && idempotencyKey) {
      const existing = await findByIdempotencyKey(userId, idempotencyKey);
      if (existing) return summaryForExisting(existing);
    }
    throw err;
  } finally {
    conn.release();
  }

  // 5. enqueue. If this crashes, the rows are safe in MySQL and the boot reconcile queues them.
  const [rows] = await pool.query(
    'SELECT id, seq, send_at, sender_id, to_email FROM emails WHERE campaign_id = ? ORDER BY seq',
    [campaignId],
  );
  try {
    await enqueueEmails(rows);
  } catch (err) {
    log.error('enqueue_failed_will_reconcile', { campaignId, error: errMsg(err) });
    warnings.push('Queue temporarily unavailable; emails are saved and will be queued automatically.');
  }

  // 6. search index (best effort)
  const senderEmail = new Map(senders.map((s) => [s.id, s.email]));
  const docs = rows.map((r) => ({
    id: r.id,
    user_id: userId,
    campaign_id: campaignId,
    sender_email: senderEmail.get(r.sender_id) ?? '',
    to_email: r.to_email,
    subject: input.subject,
    body: htmlToText(input.body),
    status: 'scheduled',
    send_at: new Date(r.send_at).toISOString(),
    sent_at: null,
  }));
  void indexEmails(docs);

  const perSender = senders.map((s, i) => ({ senderId: s.id, email: s.email, count: buckets[i].length }));
  const times = planned.map((p) => p.sendAt.getTime());
  log.info('campaign_scheduled', { campaignId, userId, accepted: planned.length, hourWindows: hours.size });

  return {
    campaignId,
    replayed: false,
    accepted: planned.length,
    duplicates: report.duplicates,
    invalid: report.invalid.length,
    invalidSamples: report.invalid.slice(0, 5),
    effectiveHourlyLimit: effectiveLimit,
    effectiveDelayMs,
    firstSendAt: new Date(Math.min(...times)).toISOString(),
    lastSendAt: new Date(Math.max(...times)).toISOString(),
    hourWindows: hours.size,
    perSender,
    warnings,
  };
}
