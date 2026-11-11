import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText, looksLikeHtml, normaliseBody, previewOf, sanitizeHtml } from '../../src/lib/html.js';

test('sanitizer keeps formatting tags but strips every attribute', () => {
  assert.equal(sanitizeHtml('<b class="x" onclick="evil()">Hi</b> <i>there</i>'), '<b>Hi</b> <i>there</i>');
  assert.equal(sanitizeHtml('<ul><li>a</li></ul><br/>'), '<ul><li>a</li></ul><br>');
});

test('sanitizer removes scripts, event handlers, links and unknown tags', () => {
  assert.equal(sanitizeHtml('<script>alert(1)</script>ok'), 'ok');
  assert.equal(sanitizeHtml('<img src=x onerror=alert(1)>ok'), 'ok');
  assert.equal(sanitizeHtml('<a href="javascript:alert(1)">x</a>'), 'x');
  assert.equal(sanitizeHtml('<svg><script>1</script></svg>y'), 'y');
});

test('sanitizer escapes stray angle brackets and unclosed tags', () => {
  assert.equal(sanitizeHtml('a < b > c'), 'a &lt; b &gt; c');
  assert.equal(sanitizeHtml('<img src=x onerror=alert(1)'), '&lt;img src=x onerror=alert(1)');
  assert.equal(sanitizeHtml('Tom &amp; Jerry & co'), 'Tom &amp; Jerry &amp; co');
});

test('html to text and previews', () => {
  assert.equal(htmlToText('<div>Hi <b>Ravi</b></div><div>Line 2</div>'), 'Hi Ravi\nLine 2');
  assert.equal(looksLikeHtml('plain text'), false);
  assert.equal(normaliseBody('a\nb').html, 'a<br>b');
  assert.equal(previewOf('<p>' + 'x'.repeat(200) + '</p>', 20).length, 20);
});
