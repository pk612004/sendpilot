import { Queue } from 'bullmq';
import { env } from '../config/env.js';
import { redis } from '../redis/connection.js';

export const EMAIL_QUEUE = 'email-send';
export const NOTIFY_QUEUE = 'notifications';

/**
 * The job only carries ids. MySQL holds the content and the status, so a job
 * can never send stale data, and Redis memory stays small at 100k+ jobs.
 */
export const emailQueue = new Queue(EMAIL_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: env.JOB_ATTEMPTS,
    backoff: { type: 'exponential', delay: env.JOB_BACKOFF_MS },
    removeOnComplete: { age: 24 * 3600, count: 10_000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

export const notifyQueue = new Queue(NOTIFY_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    // Keep for 2h so the jobId-based dedupe ("one alert per sender per hour") works.
    removeOnComplete: { age: 2 * 3600 },
    removeOnFail: { age: 2 * 3600 },
  },
});

/** jobId = email id. BullMQ ignores an add() whose jobId already exists => queue-level idempotency. */
export const emailJobId = (emailId) => `email-${emailId}`;

export function emailJob(emailId, seq, sendAtMs) {
  return {
    name: 'send',
    data: { emailId, seq },
    opts: { jobId: emailJobId(emailId), delay: Math.max(0, sendAtMs - Date.now()) },
  };
}

export async function enqueueEmails(rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500).map((r) => emailJob(r.id, r.seq, r.send_at.getTime()));
    await emailQueue.addBulk(batch);
  }
}
