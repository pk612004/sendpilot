import { Router } from 'express';
import { env, isProd } from '../config/env.js';
import { ah } from '../lib/http.js';
import { log, errMsg } from '../lib/logger.js';
import { requireAuth } from '../middleware/auth.js';
import {
  SESSION_COOKIE,
  STATE_COOKIE,
  getUser,
  googleAuthUrl,
  handleGoogleCallback,
  newState,
  signSession,
} from '../services/auth.js';

export const authRouter = Router();

const cookieBase = { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' };

authRouter.get('/google', (_req, res) => {
  const state = newState();
  res.cookie(STATE_COOKIE, state, { ...cookieBase, maxAge: 10 * 60 * 1000 });
  res.redirect(googleAuthUrl(state));
});

authRouter.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const fail = (reason) => res.redirect(`${env.APP_URL}/?error=${encodeURIComponent(reason)}`);
  if (error) return fail(error);
  if (!code || !state || state !== req.cookies?.[STATE_COOKIE]) return fail('invalid_state');
  try {
    const user = await handleGoogleCallback(code);
    res.clearCookie(STATE_COOKIE, cookieBase);
    res.cookie(SESSION_COOKIE, signSession(user.id), { ...cookieBase, maxAge: 7 * 24 * 3600 * 1000 });
    log.info('user_logged_in', { userId: user.id });
    return res.redirect(`${env.APP_URL}/dashboard`);
  } catch (err) {
    log.warn('google_login_failed', { error: errMsg(err) });
    return fail('login_failed');
  }
});

authRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const user = await getUser(req.userId);
    if (!user) return res.status(401).json({ error: 'User no longer exists' });
    res.json(user);
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieBase);
  res.json({ ok: true });
});
