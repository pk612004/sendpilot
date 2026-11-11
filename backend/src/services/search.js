import { Client } from '@elastic/elasticsearch';
import { env, searchEnabled } from '../config/env.js';
import { pool } from '../db/pool.js';
import { log, errMsg } from '../lib/logger.js';

/**
 * Elasticsearch is a SECONDARY index. MySQL is the truth.
 *  - Indexing failures never fail a request or a send (logged + fixable via `npm run reindex`).
 *  - If ES is down, search falls back to MySQL and tells the UI it's degraded.
 */
export const es = searchEnabled ? new Client({ node: env.ELASTICSEARCH_URL, requestTimeout: 5000 }) : null;
const INDEX = env.ELASTICSEARCH_INDEX;

export async function ensureIndex() {
  if (!es) {
    log.info('search_disabled', { hint: 'ELASTICSEARCH_URL is empty; search uses MySQL' });
    return;
  }
  try {
    const exists = await es.indices.exists({ index: INDEX });
    if (exists) return;
    await es.indices.create({
      index: INDEX,
      mappings: {
        properties: {
          id: { type: 'long' },
          user_id: { type: 'long' },
          campaign_id: { type: 'long' },
          sender_email: { type: 'keyword' },
          // text for full-text search + keyword for exact match / prefix
          to_email: { type: 'text', analyzer: 'simple', fields: { raw: { type: 'keyword' } } },
          subject: { type: 'text' },
          body: { type: 'text' },
          status: { type: 'keyword' },
          send_at: { type: 'date' },
          sent_at: { type: 'date' },
        },
      },
    });
    log.info('es_index_created', { index: INDEX });
  } catch (err) {
    log.warn('es_unavailable_on_boot', { error: errMsg(err) });
  }
}

export async function indexEmails(docs) {
  if (!es || !docs.length) return;
  try {
    for (let i = 0; i < docs.length; i += 1000) {
      const chunk = docs.slice(i, i + 1000);
      const operations = chunk.flatMap((d) => [{ index: { _index: INDEX, _id: String(d.id) } }, d]);
      const res = await es.bulk({ operations, refresh: false });
      if (res.errors) log.warn('es_bulk_partial_failure', { count: chunk.length });
    }
  } catch (err) {
    log.warn('es_index_failed', { error: errMsg(err), count: docs.length });
  }
}

export async function updateEmailDoc(id, patch) {
  if (!es) return;
  try {
    await es.update({ index: INDEX, id: String(id), doc: patch, retry_on_conflict: 3 });
  } catch (err) {
    log.warn('es_update_failed', { id, error: errMsg(err) });
  }
}

export async function searchEmails(userId, q, status) {
  try {
    if (!es) throw new Error('search disabled');
    const res = await es.search({
      index: INDEX,
      size: 50,
      query: {
        bool: {
          filter: [{ term: { user_id: userId } }, ...(status?.length ? [{ terms: { status } }] : [])],
          should: [
            { multi_match: { query: q, fields: ['subject^3', 'to_email^2', 'body'], fuzziness: 'AUTO' } },
            { prefix: { 'to_email.raw': q.toLowerCase() } },
          ],
          minimum_should_match: 1,
        },
      },
      sort: [{ _score: 'desc' }, { send_at: 'desc' }],
    });
    const hits = res.hits.hits
      .map((h) => h._source)
      .map((d) => ({
        id: d.id,
        to_email: d.to_email,
        subject: d.subject,
        status: d.status,
        send_at: d.send_at,
        sent_at: d.sent_at,
        sender_email: d.sender_email,
      }));
    return { hits, source: 'elasticsearch' };
  } catch (err) {
    log.warn('es_search_failed_fallback_mysql', { error: errMsg(err) });
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const params = [userId, like, like];
    let statusSql = '';
    if (status?.length) {
      statusSql = `AND e.status IN (?)`;
      params.push(status);
    }
    const [rows] = await pool.query(
      `SELECT e.id, e.to_email, e.subject, e.status, e.send_at, e.sent_at, s.email AS sender_email
         FROM emails e JOIN senders s ON s.id = e.sender_id
        WHERE e.user_id = ? AND (e.to_email LIKE ? OR e.subject LIKE ?) ${statusSql}
        ORDER BY e.send_at DESC LIMIT 50`,
      params,
    );
    return { hits: rows, source: 'mysql-fallback' };
  }
}
