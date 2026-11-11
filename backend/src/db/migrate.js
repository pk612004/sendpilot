import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { env, dbSsl } from '../config/env.js';
import { log, errMsg } from '../lib/logger.js';

/**
 * Idempotent: creates the database if it doesn't exist, then every table with
 * CREATE ... IF NOT EXISTS. Safe to run on every deploy, and works with a local
 * MySQL install as well as the Docker one.
 */
async function main() {
  const url = new URL(env.DATABASE_URL);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'sendpilot';
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error(`Unsupported database name: ${dbName}`);

  // Connect to the server without selecting a database, so we can create it.
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: dbSsl,
  });
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await conn.query(`USE \`${dbName}\``);
    const sql = fs.readFileSync(path.join(import.meta.dirname, 'schema.sql'), 'utf8');
    const statements = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) await conn.query(statement);
    log.info('migrations_applied', { database: dbName, host: url.hostname });
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  log.error('migration_failed', { error: errMsg(err) });
  if (/ER_ACCESS_DENIED|Access denied/i.test(errMsg(err))) {
    // eslint-disable-next-line no-console
    console.error('\n  -> Wrong MySQL user/password in DATABASE_URL (backend/.env).\n');
  }
  if (/ECONNREFUSED/i.test(errMsg(err))) {
    // eslint-disable-next-line no-console
    console.error(
      '\n  -> MySQL is not running. Start the "MySQL80" service (Win+R -> services.msc) or Docker MySQL.\n',
    );
  }
  process.exit(1);
});
