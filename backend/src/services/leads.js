/**
 * Lead hygiene. The frontend does the same parsing for the live count,
 * but the backend never trusts the client and re-validates everything.
 */
// Pragmatic email check (RFC 5322 is too permissive for cold outreach anyway).
const EMAIL_RE =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isValidEmail(s) {
  if (s.length > 320) return false;
  const at = s.lastIndexOf('@');
  if (at < 1 || at > 64) return false; // local part max 64 chars
  return EMAIL_RE.test(s);
}

/** Normalize: trim, strip quotes/angle brackets, lowercase, dedupe (first occurrence wins). */
export function normalizeLeads(raw) {
  const seen = new Set();
  const valid = [];
  const invalid = [];
  let duplicates = 0;
  for (const r of raw) {
    const cleaned = r
      .trim()
      .replace(/^["'<]+|["'>]+$/g, '')
      .trim()
      .toLowerCase();
    if (!cleaned) continue;
    if (!isValidEmail(cleaned)) {
      invalid.push(r.trim());
      continue;
    }
    if (seen.has(cleaned)) {
      duplicates++;
      continue;
    }
    seen.add(cleaned);
    valid.push(cleaned);
  }
  return { valid, duplicates, invalid };
}

/** Extract candidate emails from raw CSV / text content (any column, any separator). */
export function extractFromText(text) {
  return text
    .split(/[\s,;|\t]+/)
    .map((t) => t.trim())
    .filter((t) => t.includes('@'));
}
