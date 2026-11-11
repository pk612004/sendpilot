import { Worker } from 'bullmq';
import { env } from './config/env.js';
import { createRedis, checkRedisDurability, redis } from './redis/connection.js';
import { EMAIL_QUEUE, NOTIFY_QUEUE, emailQueue, notifyQueue } from './queue/queues.js';
import { emailRepo } from './db/emailRepo.js';
import { pool } from './db/pool.js';
import { createMailer } from './services/mailer.js';
import { createRateLimiter } from './services/rateLimiter.js';
import { createEmailProcessor } from './workers/emailProcessor.js';
import { reconcileOnBoot } from './workers/reconcile.js';
import { ensureIndex, updateEmailDoc } from './services/search.js';
import { postToUser, rateLimitMessage } from './services/slack.js';
import { log, errMsg } from './lib/logger.js';
import dns from 'node:dns';

// Optional: use explicit DNS servers for SMTP lookups (local DNS on Windows can time out).
if (process.env.DNS_SERVERS) dns.setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()));

const LOCK_MS = 60_000;

const processEmail = createEmailProcessor({
  repo: emailRepo,
  mailer: createMailer(),
  limiter: createRateLimiter(redis),
  config: {
    maxPerHourPerSender: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    minDelayMs: env.MIN_DELAY_BETWEEN_EMAILS_MS,
    jobAttempts: env.JOB_ATTEMPTS,
  },
  // One Slack alert per sender per hour window: dedupe via a deterministic jobId.
  notifyRateLimit: async (d) => {
    await notifyQueue.add('rate-limit', d, { jobId: `rl-${d.senderId}-${d.hour}` });
  },
  onStatusChange: (id, patch) => updateEmailDoc(id, patch),
});

async function processNotification(job) {
  const { text, blocks } = rateLimitMessage(job.data.senderEmail, job.data.limit, job.data.hour);
  const result = await postToUser(job.data.userId, text, blocks);
  log.info('slack_rate_limit_notification', { userId: job.data.userId, result });
  return { result };
}

async function main() {
  await checkRedisDurability();
  await ensureIndex();
  // Stale = older than 2x the lock: by then BullMQ would already have re-run a live job.
  await reconcileOnBoot(LOCK_MS * 2);

  const emailWorker = new Worker(EMAIL_QUEUE, processEmail, {
    connection: createRedis('email-worker'),
    concurrency: env.WORKER_CONCURRENCY,
    lockDuration: LOCK_MS, // auto-renewed while the job runs
    stalledInterval: 30_000,
    maxStalledCount: 1, // a crashed job is re-run once, and the processor marks it 'uncertain'
  });

  const notifyWorker = new Worker(NOTIFY_QUEUE, processNotification, {
    connection: createRedis('notify-worker'),
    concurrency: 5,
  });

  emailWorker.on('failed', (job, err) => log.warn('job_failed', { jobId: job?.id, error: errMsg(err) }));
  emailWorker.on('error', (err) => log.error('worker_error', { error: errMsg(err) }));
  notifyWorker.on('failed', (job, err) => log.warn('notify_failed', { jobId: job?.id, error: errMsg(err) }));

  log.info('worker_started', {
    concurrency: env.WORKER_CONCURRENCY,
    maxPerHourPerSender: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    minDelayMs: env.MIN_DELAY_BETWEEN_EMAILS_MS,
  });

  // Graceful shutdown: stop taking new jobs, let in-flight sends finish, then exit.
  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    log.info('worker_shutting_down', { signal });
    const force = setTimeout(() => process.exit(1), 25_000);
    try {
      await Promise.all([emailWorker.close(), notifyWorker.close()]);
      await Promise.all([emailQueue.close(), notifyQueue.close()]);
      await pool.end();
      redis.disconnect();
    } finally {
      clearTimeout(force);
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  log.error('worker_boot_failed', { error: errMsg(err) });
  process.exit(1);
});
