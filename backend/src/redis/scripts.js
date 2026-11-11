/**
 * Two atomic Lua scripts. Running the read-check-write inside Redis means
 * any number of API servers / worker processes can call them concurrently
 * without race conditions (no in-memory counters anywhere).
 *
 * Key layout (prefix "sp"):
 *   sp:plan:{senderId}:{hourIndex}  slots RESERVED at schedule time (planning)
 *   sp:sent:{senderId}:{hourIndex}  slots CONSUMED at send time (enforcement, authoritative)
 *   sp:next:{senderId}              earliest timestamp the sender may send again (min gap)
 * hourIndex = floor(epochMs / 3_600_000)  => fixed UTC hour windows.
 *
 * Note: keys are built inside the script, which is fine for a single Redis node.
 * For Redis Cluster we'd pass them via KEYS with a {senderId} hash tag.
 */
/**
 * RESERVE_SLOTS: spread N emails of one sender across hour windows.
 * ARGV: prefix, senderId, startMs, delayMs, limit, n
 * Returns a flat array: [hour, take, usedBefore, hour, take, usedBefore, ...]
 * Capacity of an hour = min(limit - alreadyReserved, how many fit in the remaining
 * part of that hour at the given delay).
 */
export const RESERVE_SLOTS_LUA = `
local prefix = ARGV[1]
local sender = ARGV[2]
local startMs = tonumber(ARGV[3])
local delay = math.max(tonumber(ARGV[4]), 1)
local limit = tonumber(ARGV[5])
local n = tonumber(ARGV[6])
local H = 3600000
local hour = math.floor(startMs / H)
local out = {}
local guard = 0
while n > 0 and guard < 100000 do
  local hs = hour * H
  local from = math.max(startMs, hs)
  local key = prefix .. ':plan:' .. sender .. ':' .. hour
  local used = tonumber(redis.call('GET', key) or '0')
  local timeCap = math.ceil((hs + H - from) / delay)
  local free = math.min(limit - used, timeCap)
  if free > 0 then
    local take = math.min(free, n)
    redis.call('INCRBY', key, take)
    redis.call('PEXPIREAT', key, (hour + 2) * H)
    table.insert(out, hour)
    table.insert(out, take)
    table.insert(out, used)
    n = n - take
  end
  hour = hour + 1
  guard = guard + 1
end
return out
`;

/**
 * ACQUIRE_SEND: called by the worker right before sending.
 * ARGV: prefix, senderId, limit, gapMs
 * Uses Redis server TIME (one clock for every worker => no clock-skew bugs).
 * Returns {1, slotAtMs, hour, countAfter}  -> allowed; wait until slotAt then send
 *         {0, retryAtMs, hour, count}      -> hourly limit hit; retry at next window
 * The min-gap works like a ticket machine: each caller claims the next free
 * slot (now or last+gap), so parallel jobs line up instead of stampeding.
 */
export const ACQUIRE_SEND_LUA = `
local prefix = ARGV[1]
local sender = ARGV[2]
local limit = tonumber(ARGV[3])
local gap = tonumber(ARGV[4])
local H = 3600000
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local nextKey = prefix .. ':next:' .. sender
local nextFree = tonumber(redis.call('GET', nextKey) or '0')
local slot = math.max(now, nextFree)
local hour = math.floor(slot / H)
local countKey = prefix .. ':sent:' .. sender .. ':' .. hour
local count = tonumber(redis.call('GET', countKey) or '0')
if count >= limit then
  return {0, (hour + 1) * H, hour, count}
end
redis.call('INCR', countKey)
redis.call('PEXPIREAT', countKey, (hour + 2) * H)
if gap > 0 then
  redis.call('SET', nextKey, slot + gap, 'PX', gap + H)
end
return {1, slot, hour, count + 1}
`;

export function registerRateLimitScripts(client) {
  client.defineCommand('reserveSlots', { numberOfKeys: 0, lua: RESERVE_SLOTS_LUA });
  client.defineCommand('acquireSend', { numberOfKeys: 0, lua: ACQUIRE_SEND_LUA });
}
