import { pool } from './pool.js';

export const emailRepo = {
  async getForSend(id) {
    const [rows] = await pool.query(
      `SELECT e.id, e.seq, e.user_id, e.status, e.to_email, e.subject,
              c.body, c.delay_ms, c.hourly_limit,
              s.id AS sender_id, s.name AS sender_name, s.email AS sender_email,
              s.smtp_host, s.smtp_port, s.smtp_secure, s.smtp_user, s.smtp_pass_enc
         FROM emails e
         JOIN campaigns c ON c.id = e.campaign_id
         JOIN senders s   ON s.id = e.sender_id
        WHERE e.id = ?`,
      [id],
    );
    return rows[0] ?? null;
  },
  /** scheduled -> sending. Returns true only for the single winner. */
  async claim(id) {
    const [r] = await pool.query(
      `UPDATE emails SET status = 'sending', attempts = attempts + 1, locked_at = NOW(3)
        WHERE id = ? AND status = 'scheduled'`,
      [id],
    );
    return r.affectedRows === 1;
  },
  async markSent(id, messageId, previewUrl) {
    await pool.query(
      `UPDATE emails SET status = 'sent', sent_at = NOW(3), message_id = ?, preview_url = ?, last_error = NULL
        WHERE id = ? AND status IN ('sending', 'uncertain')`,
      [messageId, previewUrl, id],
    );
  },
  /** Transient failure: give it back so the BullMQ retry can claim it again. */
  async release(id, error) {
    await pool.query(
      `UPDATE emails SET status = 'scheduled', locked_at = NULL, last_error = ?
        WHERE id = ? AND status = 'sending'`,
      [error.slice(0, 1000), id],
    );
  },
  async markFailed(id, error) {
    await pool.query(
      `UPDATE emails SET status = 'failed', locked_at = NULL, last_error = ?
        WHERE id = ? AND status IN ('scheduled', 'sending')`,
      [error.slice(0, 1000), id],
    );
  },
  async markUncertain(id, reason) {
    await pool.query(
      `UPDATE emails SET status = 'uncertain', last_error = ? WHERE id = ? AND status = 'sending'`,
      [reason.slice(0, 1000), id],
    );
  },
  /** Rate limiter pushed it to a later window: keep status, move the planned time. */
  async markDeferred(id, newSendAt, reason) {
    await pool.query(
      `UPDATE emails SET send_at = ?, deferred_count = deferred_count + 1, last_error = ?
        WHERE id = ? AND status = 'scheduled'`,
      [newSendAt, reason, id],
    );
  },
  /** Boot reconcile, step 1: everything that should still be in the queue. */
  async listScheduled(afterId, limit) {
    const [rows] = await pool.query(
      `SELECT id, seq, send_at FROM emails WHERE status = 'scheduled' AND id > ? ORDER BY id LIMIT ?`,
      [afterId, limit],
    );
    return rows;
  },
  /** Boot reconcile, step 2: rows stuck in 'sending' long after any lock would have expired. */
  async markStaleSendingUncertain(olderThanMs) {
    const [r] = await pool.query(
      `UPDATE emails SET status = 'uncertain',
              last_error = 'Process stopped while sending; not resent to avoid a duplicate (at-most-once)'
        WHERE status = 'sending' AND locked_at < (NOW(3) - INTERVAL ? MICROSECOND)`,
      [olderThanMs * 1000],
    );
    return r.affectedRows;
  },
};
