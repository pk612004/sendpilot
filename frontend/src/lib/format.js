export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Value for <input type="datetime-local"> in the user's local time zone. */
export function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function relativeTime(iso) {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000);
  const label = m < 1 ? 'less than a minute' : m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
  return diff >= 0 ? `in ${label}` : `${label} ago`;
}

/**
 * Same math as the backend planner, for an instant "what will happen" preview in the compose modal.
 * Estimate only (it ignores capacity other campaigns already reserved).
 */
export function estimatePlan(count, senders, startMs, delayMs, limit) {
  const H = 3_600_000;
  if (count === 0 || senders === 0) return null;
  const perSender = Math.ceil(count / senders);
  let hour = Math.floor(startMs / H);
  let left = perSender;
  let last = startMs;
  let windows = 0;
  while (left > 0 && windows < 10_000) {
    const from = Math.max(startMs, hour * H);
    const cap = Math.min(limit, Math.ceil((hour * H + H - from) / Math.max(delayMs, 1)));
    if (cap > 0) {
      const take = Math.min(cap, left);
      last = from + (take - 1) * delayMs;
      left -= take;
      windows++;
    }
    hour++;
  }
  return { perSender, windows, lastAt: new Date(last) };
}

/** "Tue 9:15:12 AM" — the pill format used in the email list. Adds the date when not this week. */
export function formatPillTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const days = Math.abs(d.getTime() - Date.now()) / 86_400_000;
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  if (days < 6) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

/** "Nov 3, 10:23 AM" — detail view header. */
export function formatLong(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
