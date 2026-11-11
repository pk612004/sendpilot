import { SESSION_COOKIE, verifySession } from '../services/auth.js';
import { env } from '../config/env.js';

/** Every data route goes through this. Every query is then filtered by req.userId (tenant isolation). */
export function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  const userId = token ? verifySession(token) : null;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  req.userId = userId;
  next();
}

/** Basic auth for the Bull Board UI (it exposes job data, so it must not be public). */
export function bullBoardAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
    if (user === env.BULL_BOARD_USER && pass === env.BULL_BOARD_PASS) return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="queues"');
  return res.status(401).send('Authentication required');
}
