import 'dotenv/config';

// Nodemailer caches the first Ethereal test account and returns it for every
// createTestAccount() call, which would give every sender the SAME inbox.
// Must be set before nodemailer is first loaded (entrypoints import env first).
process.env.ETHEREAL_CACHE ??= 'false';
import { z } from 'zod';

/**
 * All configuration is validated once at boot. If something is missing the
 * process exits immediately with a readable message instead of failing later.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  // Public origin of the frontend. The frontend proxies /api/* to this backend,
  // so OAuth redirect URIs and cookies all live on this origin.
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().default('mysql://sendpilot:sendpilot@localhost:3307/sendpilot'),
  // Set DB_SSL=true for cloud databases that need TLS (TiDB Cloud, PlanetScale...).
  DB_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  // Leave empty to run without Elasticsearch (search then uses MySQL).
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().default('emails'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 32 bytes as 64 hex chars'),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  // Slack is optional: without it the "Connect Slack" button is hidden and
  // rate-limit hits simply don't notify.
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  // Throughput knobs (never hardcoded)
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
  MIN_DELAY_BETWEEN_EMAILS_MS: z.coerce.number().int().min(0).default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().min(1).default(200),
  MAX_LEADS_PER_CAMPAIGN: z.coerce.number().int().min(1).default(10000),
  JOB_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  JOB_BACKOFF_MS: z.coerce.number().int().min(100).default(30000),
  DEFAULT_SENDERS_PER_USER: z.coerce.number().int().min(0).max(5).default(2),
  // smtp = really send through each sender's SMTP server (Ethereal).
  // simulate = pretend to send (for hosts that block SMTP ports, like free cloud plans).
  MAIL_MODE: z.enum(['smtp', 'simulate']).default('smtp'),
  BULL_BOARD_USER: z.string().default('admin'),
  BULL_BOARD_PASS: z.string().min(6).default('change-me'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const slackEnabled = Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET);
export const REDIS_PREFIX = 'sp';
export const searchEnabled = Boolean(env.ELASTICSEARCH_URL);
export const simulateMail = env.MAIL_MODE === 'simulate';
export const dbSsl = env.DB_SSL ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined;
