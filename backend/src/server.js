import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { redis, checkRedisDurability } from './redis/connection.js';
import { emailQueue, notifyQueue } from './queue/queues.js';
import { es, ensureIndex } from './services/search.js';
import { authRouter } from './routes/auth.routes.js';
import { apiRouter } from './routes/api.routes.js';
import { slackRouter } from './routes/slack.routes.js';
import { bullBoardAuth } from './middleware/auth.js';
import { errorHandler } from './lib/http.js';
import { log, errMsg } from './lib/logger.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(cors({ origin: env.APP_URL, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '5mb' })); // ~10k leads fit comfortably

/* Live BullMQ dashboard (real-time queue visibility) */
const boardAdapter = new ExpressAdapter();
boardAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullMQAdapter(emailQueue), new BullMQAdapter(notifyQueue)],
  serverAdapter: boardAdapter,
});
app.use('/admin/queues', bullBoardAuth, boardAdapter.getRouter());

/* Health: shows the state of every dependency */
app.get('/health', async (_req, res) => {
  const check = async (fn) =>
    fn()
      .then(() => 'up')
      .catch(() => 'down');
  const [mysql, redisS, elastic] = await Promise.all([
    check(() => pool.query('SELECT 1')),
    check(() => redis.ping()),
    es ? check(() => es.ping()) : Promise.resolve('off'),
  ]);
  const ok = mysql === 'up' && redisS === 'up';
  res.status(ok ? 200 : 503).json({ ok, mysql, redis: redisS, elasticsearch: elastic });
});

app.use('/api/auth', authRouter);
app.use('/api/slack', slackRouter);
app.use('/api', apiRouter);
app.use(errorHandler);

async function main() {
  await checkRedisDurability();
  await ensureIndex();
  const server = app.listen(env.PORT, () =>
    log.info('api_listening', { port: env.PORT, board: `/admin/queues` }),
  );

  const shutdown = (signal) => {
    log.info('api_shutting_down', { signal });
    server.close(async () => {
      await Promise.allSettled([emailQueue.close(), notifyQueue.close(), pool.end()]);
      redis.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  log.error('api_boot_failed', { error: errMsg(err) });
  process.exit(1);
});
