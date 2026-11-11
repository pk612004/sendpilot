import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { HttpError } from '../lib/http.js';

/**
 * Real Google OAuth 2.0 (authorization-code flow), done on the backend:
 *   /api/auth/google          -> redirect to Google with a random `state` (also set as httpOnly cookie)
 *   /api/auth/google/callback -> verify state, exchange code, VERIFY the ID token signature + audience,
 *                                upsert user, set our own httpOnly session cookie (JWT, 7 days)
 * The browser never sees Google tokens. The frontend only gets the session cookie.
 */
export const GOOGLE_REDIRECT_PATH = '/api/auth/google/callback';
export const SESSION_COOKIE = 'sp_session';
export const STATE_COOKIE = 'sp_oauth_state';

const oauth = () =>
  new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, `${env.APP_URL}${GOOGLE_REDIRECT_PATH}`);

export function newState() {
  return crypto.randomBytes(24).toString('hex');
}

export function googleAuthUrl(state) {
  return oauth().generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
    access_type: 'online',
  });
}

export async function handleGoogleCallback(code) {
  const client = oauth();
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) throw new HttpError(400, 'Google did not return an ID token');
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
  const p = ticket.getPayload();
  if (!p?.sub || !p.email) throw new HttpError(400, 'Google profile incomplete');
  if (p.email_verified === false) throw new HttpError(403, 'Google email is not verified');

  await pool.query(
    `INSERT INTO users (google_sub, email, name, avatar_url) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE email = VALUES(email), name = VALUES(name), avatar_url = VALUES(avatar_url)`,
    [p.sub, p.email, p.name ?? p.email, p.picture ?? null],
  );
  const [rows] = await pool.query('SELECT id, email, name, avatar_url FROM users WHERE google_sub = ?', [
    p.sub,
  ]);
  return rows[0];
}

export function signSession(userId) {
  return jwt.sign({ sub: String(userId) }, env.JWT_SECRET, { expiresIn: '7d' });
}

export function verifySession(token) {
  try {
    const p = jwt.verify(token, env.JWT_SECRET);
    const id = Number(p.sub);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export async function getUser(id) {
  const [rows] = await pool.query('SELECT id, email, name, avatar_url FROM users WHERE id = ?', [id]);
  return rows[0] ?? null;
}
