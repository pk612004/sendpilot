/**
 * Same allowlist sanitizer as the backend (backend/src/lib/html.js).
 * Bodies are sanitised on the server when saved; we sanitise AGAIN before rendering
 * (defence in depth: never trust what comes back from an API into innerHTML).
 */
const ALLOWED = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'strike',
  'p',
  'br',
  'div',
  'span',
  'ul',
  'ol',
  'li',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'pre',
  'code',
]);

function escapeText(t) {
  return t
    .replace(/&(?![a-zA-Z]+;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function looksLikeHtml(s) {
  return /<\/?[a-zA-Z][^>]*>/.test(s);
}

export function sanitizeHtml(input) {
  const s = input
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|template|noscript|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '');
  const out = [];
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^<>]*>/g;
  let last = 0;
  let m;
  while ((m = tagRe.exec(s))) {
    out.push(escapeText(s.slice(last, m.index)));
    const tag = m[1].toLowerCase();
    if (ALLOWED.has(tag)) {
      if (tag === 'br') out.push('<br>');
      else out.push(m[0][1] === '/' ? `</${tag}>` : `<${tag}>`);
    }
    last = tagRe.lastIndex;
  }
  out.push(escapeText(s.slice(last)));
  return out.join('');
}

/** Any stored body (plain text or HTML) -> safe HTML for display. */
export function bodyToSafeHtml(body) {
  return looksLikeHtml(body) ? sanitizeHtml(body) : escapeText(body).replace(/\n/g, '<br>');
}

export function htmlToText(html) {
  const div = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (!div) return html.replace(/<[^>]+>/g, '');
  div.innerHTML = sanitizeHtml(html);
  return (div.innerText || div.textContent || '').trim();
}
