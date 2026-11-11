import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ah, HttpError } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { scheduleCampaign, scheduleSchema } from '../services/campaigns.js';
import { createEtherealSender, ensureDefaultSenders } from '../services/senders.js';
import { getUser } from '../services/auth.js';
import { searchEmails } from '../services/search.js';
import { env, slackEnabled, simulateMail } from '../config/env.js';
import { previewOf } from '../lib/html.js';

export const apiRouter = Router();
apiRouter.use(requireAuth);

/* ---------- config the UI needs (so limits are never hardcoded in the frontend) ---------- */
apiRouter.get('/config', (_req, res) => {
  res.json({
    maxEmailsPerHourPerSender: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    minDelayBetweenEmailsMs: env.MIN_DELAY_BETWEEN_EMAILS_MS,
    maxLeadsPerCampaign: env.MAX_LEADS_PER_CAMPAIGN,
    slackEnabled,
    simulateMail,
  });
});

/* ---------- senders ---------- */
apiRouter.get(
  '/senders',
  ah(async (req, res) => {
    const user = await getUser(req.userId);
    res.json(await ensureDefaultSenders(req.userId, user?.name ?? 'Sender'));
  }),
);

apiRouter.post(
  '/senders',
  ah(async (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(100) }).parse(req.body);
    res.status(201).json(await createEtherealSender(req.userId, name));
  }),
);

/* ---------- campaigns ---------- */
apiRouter.post(
  '/campaigns',
  ah(async (req, res) => {
    const input = scheduleSchema.parse(req.body);
    const key = req.header('Idempotency-Key')?.slice(0, 128);
    const summary = await scheduleCampaign(req.userId, input, key || undefined);
    res.status(summary.replayed ? 200 : 201).json(summary);
  }),
);

/* ---------- emails (tabs) ---------- */
const TAB_STATUSES = {
  scheduled: ['scheduled', 'sending'],
  sent: ['sent', 'failed', 'uncertain'],
};

apiRouter.get(
  '/emails',
  ah(async (req, res) => {
    const q = z
      .object({
        tab: z.enum(['scheduled', 'sent']),
        status: z.enum(['scheduled', 'sending', 'sent', 'failed', 'uncertain']).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
      })
      .parse(req.query);
    // optional status filter, but only within the tab's own statuses
    const statuses = q.status && TAB_STATUSES[q.tab].includes(q.status) ? [q.status] : TAB_STATUSES[q.tab];
    const order =
      q.tab === 'scheduled' ? 'e.send_at ASC, e.seq ASC' : 'COALESCE(e.sent_at, e.updated_at) DESC';
    const [rows] = await pool.query(
      `SELECT e.id, e.to_email, e.subject, e.status, e.send_at, e.sent_at, e.attempts, e.deferred_count,
            e.last_error, e.preview_url, s.email AS sender_email, c.hourly_limit, c.body
       FROM emails e
       JOIN senders s   ON s.id = e.sender_id
       JOIN campaigns c ON c.id = e.campaign_id
      WHERE e.user_id = ? AND e.status IN (?)
      ORDER BY ${order}
      LIMIT ? OFFSET ?`,
      [req.userId, statuses, q.pageSize, (q.page - 1) * q.pageSize],
    );
    const [[count]] = await pool.query(
      'SELECT COUNT(*) AS total FROM emails WHERE user_id = ? AND status IN (?)',
      [req.userId, statuses],
    );
    const items = rows.map(({ body, ...r }) => ({ ...r, body_preview: previewOf(String(body)) }));
    res.json({ items, total: Number(count.total), page: q.page, pageSize: q.pageSize });
  }),
);

apiRouter.get(
  '/emails/stats',
  ah(async (req, res) => {
    const [rows] = await pool.query(
      'SELECT status, COUNT(*) AS n FROM emails WHERE user_id = ? GROUP BY status',
      [req.userId],
    );
    const stats = { scheduled: 0, sending: 0, sent: 0, failed: 0, uncertain: 0 };
    for (const r of rows) stats[r.status] = Number(r.n);
    res.json(stats);
  }),
);

/* ---------- single email (detail view) ---------- */
apiRouter.get(
  '/emails/:id(\\d+)',
  ah(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT e.id, e.campaign_id, e.to_email, e.subject, e.status, e.send_at, e.sent_at, e.attempts,
            e.deferred_count, e.last_error, e.preview_url, e.message_id,
            c.body, s.name AS sender_name, s.email AS sender_email
       FROM emails e
       JOIN campaigns c ON c.id = e.campaign_id
       JOIN senders s   ON s.id = e.sender_id
      WHERE e.id = ? AND e.user_id = ?`, // tenant isolation: only your own emails
      [Number(req.params.id), req.userId],
    );
    if (!rows[0]) throw new HttpError(404, 'Email not found');
    res.json(rows[0]); // body is sanitised at write time; the UI sanitises again before rendering
  }),
);

/* ---------- search (Elasticsearch, MySQL fallback) ---------- */
apiRouter.get(
  '/search',
  ah(async (req, res) => {
    const { q, tab } = z
      .object({
        q: z.string().trim().min(1).max(200),
        tab: z.enum(['scheduled', 'sent']).optional(),
      })
      .parse(req.query);
    if (!q) throw new HttpError(400, 'q is required');
    res.json(await searchEmails(req.userId, q, tab ? TAB_STATUSES[tab] : undefined));
  }),
);
