import mysql from 'mysql2/promise';
import { env, dbSsl } from '../config/env.js';

/**
 * timezone 'Z' => JS Date objects are written/read as UTC.
 * We also force the session time zone so NOW(3) is UTC too.
 */
export const pool = mysql.createPool({
  uri: env.DATABASE_URL,
  connectionLimit: 10,
  timezone: 'Z',
  supportBigNumbers: true,
  bigNumberStrings: false,
  multipleStatements: false,
  ssl: dbSsl,
});

pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});
