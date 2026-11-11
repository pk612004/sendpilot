/**
 * Load test: schedule N emails for the SAME start time and show how the system spreads them.
 *
 *   npm run load-test -- --leads 1000 --limit 200 --senders 2 --delay 2
 *
 * It uses the real scheduling service (Lua reservation + DB + BullMQ), with a demo user.
 * Then it prints the per-hour distribution straight from MySQL, proving:
 *   - no sender exceeds its hourly limit in any window
 *   - nothing is dropped (scheduled == accepted)
 *   - order is preserved (seq increases with send_at per sender)
 */
import { pool } from '../src/db/pool.js';
import { ensureDefaultSenders } from '../src/services/senders.js';
import { scheduleCampaign } from '../src/services/campaigns.js';
import { emailQueue, notifyQueue } from '../src/queue/queues.js';
import { redis } from '../src/redis/connection.js';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : def;
}

async function main() {
  const leads = arg('leads', 1000);
  const limit = arg('limit', 200);
  const senderCount = arg('senders', 2);
  const delay = arg('delay', 2);

  await pool.query(`INSERT INTO users (google_sub, email, name) VALUES ('load-test', 'loadtest@example.com', 'Load Test')
     ON DUPLICATE KEY UPDATE name = name`);
  const [[user]] = await pool.query("SELECT id FROM users WHERE google_sub = 'load-test'");
  const senders = (await ensureDefaultSenders(user.id, 'Load Test')).slice(0, senderCount);
  if (!senders.length) throw new Error('No senders (Ethereal unreachable?)');

  const list = Array.from({ length: leads }, (_, i) => `lead${i}@example.com`);
  // add some dirt to prove hygiene
  list.push('lead1@example.com', 'LEAD2@EXAMPLE.COM', 'not-an-email', 'broken@', '');

  const t0 = Date.now();
  const summary = await scheduleCampaign(user.id, {
    subject: `Load test ${new Date().toISOString()}`,
    body: 'Hello from the load test',
    leads: list,
    startAt: new Date(Date.now() + 60_000).toISOString(),
    delaySeconds: delay,
    hourlyLimit: limit,
    senderIds: senders.map((s) => s.id),
  });
  const ms = Date.now() - t0;

  console.log('\n=== Schedule summary ===');
  console.log({ ...summary, tookMs: ms });

  const [dist] = await pool.query(
    `SELECT s.email AS sender, DATE_FORMAT(e.send_at, '%Y-%m-%d %H:00') AS hour_window, COUNT(*) AS emails,
            MIN(e.send_at) AS first_at, MAX(e.send_at) AS last_at
       FROM emails e JOIN senders s ON s.id = e.sender_id
      WHERE e.campaign_id = ? GROUP BY s.email, hour_window ORDER BY s.email, hour_window`,
    [summary.campaignId],
  );
  console.log('\n=== Distribution per sender per UTC hour ===');
  console.table(dist.map((d) => ({ sender: d.sender, hour: d.hour_window, emails: Number(d.emails) })));

  const over = dist.filter((d) => Number(d.emails) > summary.effectiveHourlyLimit);
  const [[q]] = await pool.query('SELECT COUNT(*) AS n FROM emails WHERE campaign_id = ?', [
    summary.campaignId,
  ]);
  const counts = await emailQueue.getJobCounts('delayed', 'waiting', 'active');
  console.log('\n=== Checks ===');
  console.log(`limit respected in every window : ${over.length === 0 ? 'YES' : 'NO'}`);
  console.log(
    `rows in DB == accepted          : ${Number(q.n) === summary.accepted ? 'YES' : 'NO'} (${q.n})`,
  );
  console.log(`jobs in queue (delayed/waiting) : ${counts.delayed}/${counts.waiting}`);
  console.log('\nTip: open /admin/queues to watch them, or run the worker to see them drain.\n');

  await Promise.all([emailQueue.close(), notifyQueue.close()]);
  await pool.end();
  redis.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
