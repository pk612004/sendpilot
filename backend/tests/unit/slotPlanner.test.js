import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOUR_MS,
  assignRoundRobin,
  deferTimestamp,
  parseChunks,
  planSendTimes,
  simulateReserve,
} from '../../src/services/slotPlanner.js';

const H0 = Date.UTC(2026, 10, 7, 10, 0, 0); // 10:00 UTC

test('1000 emails, limit 200/h, start on the hour -> 5 full windows, none over limit', () => {
  const used = new Map();
  const chunks = simulateReserve(used, H0, 2000, 200, 1000);
  assert.equal(chunks.length, 5);
  assert.ok(chunks.every((c) => c.take === 200));
  assert.equal(
    chunks.reduce((s, c) => s + c.take, 0),
    1000,
  ); // nothing dropped
  const times = planSendTimes(chunks, H0, 2000);
  assert.equal(times.length, 1000);
  // strictly increasing => order preserved
  for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1]);
});

test('starting at 10:45 -> first window only has 15 minutes of capacity at the given delay', () => {
  const start = H0 + 45 * 60_000;
  const chunks = simulateReserve(new Map(), start, 10_000, 200, 300); // 10s delay -> 90 fit in 15 min
  assert.equal(chunks[0].take, 90);
  assert.equal(chunks[1].take, 200);
  assert.equal(chunks[2].take, 10);
  const times = planSendTimes(chunks, start, 10_000);
  assert.equal(times[0], start);
  assert.ok(times[89] < H0 + HOUR_MS, 'first window emails stay inside the window');
  assert.equal(times[90], H0 + HOUR_MS, 'second window starts at the top of the hour');
});

test('a second campaign for the same sender respects what the first already reserved', () => {
  const used = new Map();
  simulateReserve(used, H0, 1000, 200, 150); // campaign A takes 150 of 10:00
  const b = simulateReserve(used, H0, 1000, 200, 100); // campaign B
  assert.deepEqual(
    b.map((c) => c.take),
    [50, 50],
  );
  assert.equal(b[0].usedBefore, 150);
  const hour = Math.floor(H0 / HOUR_MS);
  assert.equal(used.get(hour), 200);
});

test('delay so large that the limit is never the bottleneck', () => {
  // 60s delay -> at most 60 per hour even though limit is 200
  const chunks = simulateReserve(new Map(), H0, 60_000, 200, 130);
  assert.deepEqual(
    chunks.map((c) => c.take),
    [60, 60, 10],
  );
});

test('parseChunks converts the Lua flat array', () => {
  assert.deepEqual(parseChunks([5, 10, 0, 6, 3, 2]), [
    { hour: 5, take: 10, usedBefore: 0 },
    { hour: 6, take: 3, usedBefore: 2 },
  ]);
});

test('round robin spreads leads evenly and keeps order inside each sender', () => {
  const b = assignRoundRobin([0, 1, 2, 3, 4, 5, 6], 3);
  assert.deepEqual(b, [
    [0, 3, 6],
    [1, 4],
    [2, 5],
  ]);
});

test('deferTimestamp keeps relative order of deferred jobs', () => {
  const next = H0 + HOUR_MS;
  assert.ok(deferTimestamp(next, 5) < deferTimestamp(next, 6));
  assert.ok(deferTimestamp(next, 999) >= next);
});
