import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { log, errMsg } from '../lib/logger.js';
import { registerRateLimitScripts } from './scripts.js';

/**
 * BullMQ requires maxRetriesPerRequest: null on connections used by workers
 * (blocking commands must wait forever instead of erroring).
 */
export function createRedis(name) {
  const client = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
  client.on('error', (err) => log.error('redis_error', { name, error: errMsg(err) }));
  registerRateLimitScripts(client);
  return client;
}

/** Shared connection for non-blocking commands (rate limiter, queue producers). */
export const redis = createRedis('shared');

/**
 * Hidden case: if Redis evicts keys under memory pressure, BullMQ silently loses
 * jobs. We warn loudly at boot. (Managed Redis may block CONFIG; that's fine.)
 */
export async function checkRedisDurability(client = redis) {
  try {
    const policy = await client.config('GET', 'maxmemory-policy');
    const aof = await client.config('GET', 'appendonly');
    if (policy[1] !== 'noeviction') {
      log.warn('redis_eviction_policy_unsafe', { policy: policy[1], expected: 'noeviction' });
    }
    if (aof[1] !== 'yes') {
      log.warn('redis_aof_disabled', {
        hint: 'jobs survive app restarts, but not a Redis restart; DB reconcile covers it',
      });
    }
  } catch {
    log.info('redis_config_check_skipped');
  }
}
