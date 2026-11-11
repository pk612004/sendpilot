/**
 * The compose editor produces HTML. We never trust it: every tag is rebuilt from an
 * allowlist with ALL attributes removed (no onclick, no href="javascript:", no style),
 * and every other "<" is escaped. Result: safe to send as email HTML and to render.
 * Pure functions, no dependencies, unit-tested.
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

export function looksLikeHtml(s) {
  return /<\/?[a-zA-Z][^>]*>/.test(s);
}

export function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-3]|blockquote|pre)>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Normalise any body (plain text or editor HTML) into safe HTML + plain text. */
export function normaliseBody(body) {
  if (looksLikeHtml(body)) {
    const html = sanitizeHtml(body);
    return { html, text: htmlToText(html) };
  }
  return { html: escapeText(body).replace(/\n/g, '<br>'), text: body };
}

export function previewOf(body, max = 140) {
  const text = (looksLikeHtml(body) ? htmlToText(body) : body).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
