/**
 * AUTOMATED PROOF of the hard constraints:
 *   "after a restart, future emails still send at the right time, and are not re-sent"
 *
 *   npm run verify:restart        (stop `npm run dev` first, so this script owns the worker)
 *
 * What it does, using the REAL stack (MySQL, Redis, BullMQ, Ethereal):
 *   1. schedules 6 emails ~25 s in the future (+ a duplicate submit with the same Idempotency-Key)
 *   2. starts a worker, then kill -9's it while the jobs are still waiting      (crash #1)
 *   3. re-enqueues every job again on purpose                                      (duplicate enqueue)
 *   4. starts a worker, kill -9's it right after the first email is sent        (crash #2, mid-campaign)
 *   5. starts a worker and waits until every email is final
 *   6. checks from MySQL: every email delivered once, none duplicated, none early
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

process.env.GOOGLE_CLIENT_ID ||= 'verify-not-needed';
process.env.GOOGLE_CLIENT_SECRET ||= 'verify-not-needed';
// fast but realistic settings for the child workers
const WORKER_ENV = { ...process.env, MIN_DELAY_BETWEEN_EMAILS_MS: '1500', WORKER_CONCURRENCY: '3' };

const LEADS = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = () => new Date().toISOString().slice(11, 19);
const say = (m) => console.log(`\x1b[36m[verify ${t()}]\x1b[0m ${m}`);

function startWorker(label) {
  // Run node directly (no npm/npx wrapper) so kill() really kills the worker process.
  const child = spawn(process.execPath, [path.join('src', 'worker.js')], {
    cwd: path.join(import.meta.dirname, '..'),
    env: WORKER_ENV,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const prefix = `\x1b[35m[${label}]\x1b[0m `;
  const relay = (d) =>
    d
      .toString()
      .split('\n')
      .filter(Boolean)
      .forEach((l) => {
        if (/email_sent|worker_started|reconcile_done|uncertain|failed|error/i.test(l))
          console.log(prefix + l);
      });
  child.stdout?.on('data', relay);
  child.stderr?.on('data', relay);
  return child;
}

function hardKill(child, label) {
  child.kill('SIGKILL'); // the real thing: no graceful shutdown, no cleanup handlers
  say(`💥 kill -9 ${label} (pid ${child.pid})`);
}

async function main() {
  const { pool } = await import('../src/db/pool.js');
  const { emailQueue, notifyQueue, enqueueEmails } = await import('../src/queue/queues.js');
  const { redis } = await import('../src/redis/connection.js');
  const { ensureDefaultSenders } = await import('../src/services/senders.js');
  const { scheduleCampaign } = await import('../src/services/campaigns.js');

  const workersBefore = await emailQueue.getWorkers();
  if (workersBefore.length) {
    console.error(
      `\n✖ ${workersBefore.length} worker(s) already connected. Stop \`npm run dev\` first so this test controls the worker.\n`,
    );
    process.exit(1);
  }

  // ---- 1. schedule
  await pool.query(`INSERT INTO users (google_sub, email, name) VALUES ('verify-restart', 'verify@example.com', 'Verify Bot')
     ON DUPLICATE KEY UPDATE name = name`);
  const [[user]] = await pool.query("SELECT id FROM users WHERE google_sub = 'verify-restart'");
  const senders = await ensureDefaultSenders(user.id, 'Verify Bot');
  if (!senders.length) throw new Error('Could not create Ethereal senders (internet needed)');

  const runId = Date.now();
  const key = `verify-${runId}`;
  const input = {
    subject: `Restart test ${runId}`,
    body: 'If you can read this in Ethereal, persistence works.',
    leads: Array.from({ length: LEADS }, (_, i) => `restart${i}.${runId}@example.com`),
    startAt: new Date(Date.now() + 25_000).toISOString(),
    delaySeconds: 2,
    hourlyLimit: 200,
    senderIds: senders.map((s) => s.id),
  };
  const first = await scheduleCampaign(user.id, input, key);
  const again = await scheduleCampaign(user.id, input, key);
  say(
    `scheduled campaign #${first.campaignId}: ${first.accepted} emails, first at ${first.firstSendAt.slice(11, 19)} UTC`,
  );
  say(`duplicate submit (same Idempotency-Key) -> campaign #${again.campaignId}, replayed=${again.replayed}`);

  const statusCounts = async () => {
    const [rows] = await pool.query(
      'SELECT status, COUNT(*) n FROM emails WHERE campaign_id = ? GROUP BY status',
      [first.campaignId],
    );
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  };

  // ---- 2. crash #1 while jobs are delayed
  let w = startWorker('worker-1');
  await sleep(6000);
  hardKill(w, 'worker-1');
  say(`after crash #1: ${JSON.stringify(await statusCounts())}  (still waiting, nothing lost)`);

  // ---- 3. duplicate enqueue on purpose
  const [rows] = await pool.query('SELECT id, seq, send_at FROM emails WHERE campaign_id = ?', [
    first.campaignId,
  ]);
  const before = await emailQueue.getJobCounts('delayed', 'waiting');
  await enqueueEmails(rows);
  await enqueueEmails(rows);
  const after = await emailQueue.getJobCounts('delayed', 'waiting');
  say(
    `re-enqueued all ${rows.length} jobs twice -> queue delayed+waiting ${before.delayed + before.waiting} -> ${after.delayed + after.waiting} (jobId dedupe)`,
  );

  // ---- 4. crash #2 mid-campaign
  w = startWorker('worker-2');
  const deadline2 = Date.now() + 120_000;
  while (Date.now() < deadline2 && ((await statusCounts()).sent ?? 0) < 1) await sleep(300);
  hardKill(w, 'worker-2');
  say(`after crash #2: ${JSON.stringify(await statusCounts())}`);

  // ---- 5. final worker drains the rest
  w = startWorker('worker-3');
  say(
    'waiting for every email to reach a final state (a job killed mid-send is picked up by the stall check, up to ~90 s)...',
  );
  const deadline = Date.now() + 4 * 60_000;
  for (;;) {
    const c = await statusCounts();
    const pending = (c.scheduled ?? 0) + (c.sending ?? 0);
    if (pending === 0 || Date.now() > deadline) break;
    await sleep(1000);
  }
  hardKill(w, 'worker-3');

  // ---- 6. checks
  const [final] = await pool.query(
    `SELECT e.to_email, e.status, e.attempts, e.message_id, e.preview_url,
            c.start_at, e.send_at, e.sent_at
       FROM emails e JOIN campaigns c ON c.id = e.campaign_id
      WHERE e.campaign_id = ? ORDER BY e.seq`,
    [first.campaignId],
  );
  console.table(
    final.map((r) => ({
      to: r.to_email.split('.')[0],
      status: r.status,
      claims: r.attempts,
      planned: new Date(r.send_at).toISOString().slice(11, 19),
      sent: r.sent_at ? new Date(r.sent_at).toISOString().slice(11, 19) : '-',
    })),
  );

  const sent = final.filter((r) => r.status === 'sent');
  const uncertain = final.filter((r) => r.status === 'uncertain');
  const ids = sent.map((r) => r.message_id);
  const checks = [
    ['duplicate submit returned the same campaign', again.campaignId === first.campaignId && again.replayed],
    ['duplicate enqueue did not add jobs', after.delayed + after.waiting <= before.delayed + before.waiting],
    [`all ${LEADS} emails reached a final state`, sent.length + uncertain.length === LEADS],
    [
      'no email was delivered twice (one successful send each)',
      sent.every((r) => r.message_id) && new Set(sent.map((r) => r.to_email)).size === sent.length,
    ],
    ['every Message-ID is unique', new Set(ids).size === ids.length],
    [
      'no email was sent before its start time',
      sent.every((r) => new Date(r.sent_at) >= new Date(r.start_at)),
    ],
  ];
  console.log('');
  for (const [name, pass] of checks) console.log(`  ${pass ? '\x1b[32m✔' : '\x1b[31m✖'}\x1b[0m ${name}`);
  if (uncertain.length) {
    console.log(
      `\n  ℹ ${uncertain.length} email(s) were being handed to SMTP at the exact moment of the crash.`,
    );
    console.log('    They are marked "uncertain" and NOT resent: at-most-once by design (see README).');
  }
  if (sent[0]?.preview_url) console.log(`\n  Open one in Ethereal: ${sent[0].preview_url}`);
  const retried = final.filter((r) => Number(r.attempts) > 1).length;
  if (retried)
    console.log(
      `\n  ℹ ${retried} email(s) were retried after a transient SMTP/DNS error (safe: the server never accepted them).`,
    );

  await Promise.all([emailQueue.close(), notifyQueue.close()]);
  await pool.end();
  redis.disconnect();
  const allPass = checks.every(([, p]) => p);
  console.log(allPass ? '\n\x1b[32mRESTART TEST PASSED\x1b[0m\n' : '\n\x1b[31mRESTART TEST FAILED\x1b[0m\n');
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
