/** Rebuild the Elasticsearch index from MySQL (the source of truth). Safe to run anytime. */
import { pool } from '../src/db/pool.js';
import { ensureIndex, indexEmails } from '../src/services/search.js';
import { redis } from '../src/redis/connection.js';
import { htmlToText } from '../src/lib/html.js';

async function main() {
  await ensureIndex();
  let afterId = 0;
  let total = 0;
  for (;;) {
    const [rows] = await pool.query(
      `SELECT e.id, e.user_id, e.campaign_id, s.email AS sender_email, e.to_email, e.subject, c.body,
              e.status, e.send_at, e.sent_at
         FROM emails e JOIN senders s ON s.id = e.sender_id JOIN campaigns c ON c.id = e.campaign_id
        WHERE e.id > ? ORDER BY e.id LIMIT 2000`,
      [afterId],
    );
    if (!rows.length) break;
    const docs = rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      campaign_id: r.campaign_id,
      sender_email: r.sender_email,
      to_email: r.to_email,
      subject: r.subject,
      body: htmlToText(r.body),
      status: r.status,
      send_at: new Date(r.send_at).toISOString(),
      sent_at: r.sent_at ? new Date(r.sent_at).toISOString() : null,
    }));
    await indexEmails(docs);
    total += rows.length;
    afterId = rows[rows.length - 1].id;
  }
  console.log(`Reindexed ${total} emails`);
  await pool.end();
  redis.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
