import { emailRepo } from '../db/emailRepo.js';
import { enqueueEmails } from '../queue/queues.js';
import { log } from '../lib/logger.js';

/**
 * Runs once at worker boot. Makes MySQL and Redis agree again, whatever happened:
 *
 *  - Normal restart: Redis still has every delayed job. Re-adding with the same
 *    jobId is a no-op, so nothing is duplicated or restarted from scratch.
 *  - Redis was wiped / lost: every 'scheduled' row is re-queued with its stored send_at.
 *  - API crashed between the DB commit and queue.add (the "dual-write" problem):
 *    those rows get queued now.
 *  - Rows stuck in 'sending' with no live lock => 'uncertain' (never auto-resent).
 *
 * Emails whose time already passed while the system was down are sent right away
 * (still through the rate limiter), in their original order.
 */
export async function reconcileOnBoot(staleSendingMs) {
  let afterId = 0;
  let total = 0;
  for (;;) {
    const rows = await emailRepo.listScheduled(afterId, 1000);
    if (!rows.length) break;
    await enqueueEmails(rows);
    total += rows.length;
    afterId = rows[rows.length - 1].id;
  }
  const stale = await emailRepo.markStaleSendingUncertain(staleSendingMs);
  log.info('reconcile_done', { scheduledChecked: total, staleSendingMarkedUncertain: stale });
}
