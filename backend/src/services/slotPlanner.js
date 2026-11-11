/**
 * Pure scheduling math (no I/O) so it can be unit-tested in isolation.
 *
 * Idea: instead of throwing 1000 jobs at "10:00" and letting 800 of them bounce
 * off the rate limiter every hour (thundering herd), we decide at schedule time
 * which hour window each email belongs to. The runtime limiter is still the
 * final authority, so the plan can never cause the limit to be exceeded.
 */
export const HOUR_MS = 3_600_000;

/** Convert the flat array returned by the RESERVE_SLOTS Lua script. */
export function parseChunks(flat) {
  const out = [];
  for (let i = 0; i + 2 < flat.length; i += 3) {
    out.push({ hour: Number(flat[i]), take: Number(flat[i + 1]), usedBefore: Number(flat[i + 2]) });
  }
  return out;
}

/**
 * Turn hour chunks into concrete send timestamps.
 * Inside an hour, emails are spaced by delayMs starting at max(startMs, hourStart).
 */
export function planSendTimes(chunks, startMs, delayMs) {
  const times = [];
  for (const c of chunks) {
    const from = Math.max(startMs, c.hour * HOUR_MS);
    for (let k = 0; k < c.take; k++) times.push(from + k * delayMs);
  }
  return times;
}

/**
 * Same algorithm as the Lua script, in JavaScript, against an in-memory map.
 * Used by unit tests (to prove the Lua logic) and by the frontend-style preview.
 */
export function simulateReserve(used, startMs, delayMs, limit, n) {
  const delay = Math.max(delayMs, 1);
  let hour = Math.floor(startMs / HOUR_MS);
  const out = [];
  let guard = 0;
  while (n > 0 && guard < 100_000) {
    const hs = hour * HOUR_MS;
    const from = Math.max(startMs, hs);
    const u = used.get(hour) ?? 0;
    const timeCap = Math.ceil((hs + HOUR_MS - from) / delay);
    const free = Math.min(limit - u, timeCap);
    if (free > 0) {
      const take = Math.min(free, n);
      used.set(hour, u + take);
      out.push({ hour, take, usedBefore: u });
      n -= take;
    }
    hour++;
    guard++;
  }
  return out;
}

/** Round-robin leads across senders (sender rotation, like real cold-email tools). */
export function assignRoundRobin(items, senderCount) {
  const buckets = Array.from({ length: senderCount }, () => []);
  items.forEach((item, i) => buckets[i % senderCount].push(item));
  return buckets;
}

/**
 * When the runtime limiter defers a job to the next window, we add a small
 * offset by its original position so deferred jobs keep their relative order.
 */
export function deferTimestamp(retryAtMs, seq) {
  return retryAtMs + (seq % 1000);
}
