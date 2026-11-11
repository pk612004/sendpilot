import { Router } from 'express';
import { env } from '../config/env.js';
import { ah } from '../lib/http.js';
import { log, errMsg } from '../lib/logger.js';
import { requireAuth } from '../middleware/auth.js';
import { buildInstallUrl, completeInstall, disconnect, getStatus, postToUser } from '../services/slack.js';

export const slackRouter = Router();
slackRouter.use(requireAuth);

slackRouter.get(
  '/status',
  ah(async (req, res) => res.json(await getStatus(req.userId))),
);

/** Browser navigates here when the user clicks "Connect Slack". */
slackRouter.get('/install', (req, res) => {
  res.redirect(buildInstallUrl(req.userId));
});

slackRouter.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const back = (status) => res.redirect(`${env.APP_URL}/dashboard?slack=${status}`);
  if (error) return back(error === 'access_denied' ? 'cancelled' : 'error');
  if (!code || !state) return back('error');
  try {
    await completeInstall(req.userId, code, state);
    return back('connected');
  } catch (err) {
    log.warn('slack_install_failed', { error: errMsg(err) });
    return back('error');
  }
});

slackRouter.delete(
  '/',
  ah(async (req, res) => {
    await disconnect(req.userId);
    res.json({ ok: true });
  }),
);

/** "Send test message": a live, verifiable call for the demo video. */
slackRouter.post(
  '/test',
  ah(async (req, res) => {
    const result = await postToUser(
      req.userId,
      '✅ SendPilot is connected. You will be notified here when a sender hits its hourly limit.',
    );
    res.status(result === 'sent' ? 200 : 409).json({ result });
  }),
);
