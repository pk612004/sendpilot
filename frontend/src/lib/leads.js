/** Client-side lead parsing for the live "N emails detected" count. The backend re-validates. */
const EMAIL_RE =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function parseLeads(text) {
  const tokens = text.split(/[\s,;|\t]+/).filter((t) => t.includes('@'));
  const seen = new Set();
  const valid = [];
  const invalid = [];
  let duplicates = 0;
  for (const raw of tokens) {
    const e = raw
      .trim()
      .replace(/^["'<]+|["'>]+$/g, '')
      .toLowerCase();
    if (!EMAIL_RE.test(e) || e.length > 320) {
      invalid.push(raw);
      continue;
    }
    if (seen.has(e)) {
      duplicates++;
      continue;
    }
    seen.add(e);
    valid.push(e);
  }
  return { valid, duplicates, invalid };
}
