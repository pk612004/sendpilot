import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { encrypt } from '../lib/crypto.js';
import { createEtherealAccount } from './mailer.js';
import { log, errMsg } from '../lib/logger.js';
import { HttpError } from '../lib/http.js';

export async function listSenders(userId) {
  const [rows] = await pool.query(
    'SELECT id, name, email, smtp_host FROM senders WHERE user_id = ? ORDER BY id',
    [userId],
  );
  return rows;
}

/** Create a sender backed by a brand-new Ethereal inbox. */
export async function createEtherealSender(userId, name) {
  let acc;
  try {
    acc = await createEtherealAccount();
  } catch (err) {
    throw new HttpError(502, `Could not create Ethereal account: ${errMsg(err)}`);
  }
  const [r] = await pool.query(
    `INSERT INTO senders (user_id, name, email, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass_enc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      name,
      acc.email,
      acc.smtp_host,
      acc.smtp_port,
      acc.smtp_secure ? 1 : 0,
      acc.smtp_user,
      encrypt(acc.smtp_pass, env.ENCRYPTION_KEY),
    ],
  );
  log.info('sender_created', { userId, email: acc.email });
  return { id: r.insertId, name, email: acc.email, smtp_host: acc.smtp_host };
}

/** First visit: give every user N ready-to-use Ethereal senders so the demo works instantly. */
export async function ensureDefaultSenders(userId, displayName) {
  const existing = await listSenders(userId);
  if (existing.length > 0 || env.DEFAULT_SENDERS_PER_USER === 0) return existing;
  for (let i = 1; i <= env.DEFAULT_SENDERS_PER_USER; i++) {
    try {
      await createEtherealSender(userId, `${displayName} (Sender ${i})`);
    } catch (err) {
      log.warn('default_sender_failed', { userId, error: errMsg(err) });
    }
  }
  return listSenders(userId);
}

export async function getOwnedSenders(userId, ids) {
  const [rows] = await pool.query(
    'SELECT id, email FROM senders WHERE user_id = ? AND id IN (?) ORDER BY id',
    [userId, ids],
  );
  if (rows.length !== new Set(ids).size) throw new HttpError(403, 'One or more senders do not belong to you');
  return rows;
}
