import { REDIS_PREFIX } from '../config/env.js';
import { parseChunks } from './slotPlanner.js';

export function createRateLimiter(redis) {
  return {
    /** Planning: reserve hour-window capacity for n emails of one sender. */
    async reserve(senderId, startMs, delayMs, limit, n) {
      const flat = await redis.reserveSlots(REDIS_PREFIX, String(senderId), startMs, delayMs, limit, n);
      return parseChunks(flat);
    },
    /** Enforcement: atomically claim a send slot (hourly limit + min gap). */
    async acquire(senderId, limit, gapMs) {
      const [ok, at, hour, count] = await redis.acquireSend(REDIS_PREFIX, String(senderId), limit, gapMs);
      return { allowed: Number(ok) === 1, at: Number(at), hour: Number(hour), count: Number(count) };
    },
  };
}
