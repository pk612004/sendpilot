/**
 * Runs the REAL Lua scripts against a REAL Redis (docker compose up -d redis).
 *   npm run test:integration
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import IORedis from 'ioredis';
import { registerRateLimitScripts } from '../../src/redis/scripts.js';
import { parseChunks, simulateReserve } from '../../src/services/slotPlanner.js';

const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379/15');
registerRateLimitScripts(redis);
const P = `sp-test-${Date.now()}`;
after(async () => {
  const keys = await redis.keys(`${P}:*`);
  if (keys.length) await redis.del(...keys);
  redis.disconnect();
});

test('reserve: Lua result equals the JavaScript model', async () => {
  const start = Date.UTC(2030, 0, 1, 10, 30);
  const lua = parseChunks(await redis.reserveSlots(P, 'A', start, 2000, 200, 1000));
  const ts = simulateReserve(new Map(), start, 2000, 200, 1000);
  assert.deepEqual(lua, ts);
});

test('acquire: 100 parallel callers, limit 30 -> exactly 30 allowed (safe across workers)', async () => {
  const results = await Promise.all(Array.from({ length: 100 }, () => redis.acquireSend(P, 'B', 30, 0)));
  const allowed = results.filter((r) => Number(r[0]) === 1).length;
  assert.equal(allowed, 30);
  const denied = results.find((r) => Number(r[0]) === 0);
  const hour = Number(denied[2]);
  assert.equal(
    Number(denied[1]),
    (hour + 1) * 3_600_000,
    'denied callers are told when the next window opens',
  );
});

test('acquire: min gap => parallel callers get slots spaced by the gap (no stampede)', async () => {
  const results = await Promise.all(Array.from({ length: 5 }, () => redis.acquireSend(P, 'C', 1000, 2000)));
  const slots = results.map((r) => Number(r[1])).sort((a, b) => a - b);
  for (let i = 1; i < slots.length; i++) assert.equal(slots[i] - slots[i - 1], 2000);
});
