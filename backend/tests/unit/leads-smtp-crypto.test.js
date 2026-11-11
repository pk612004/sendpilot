import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { extractFromText, normalizeLeads, isValidEmail } from '../../src/services/leads.js';
import { classifySmtpError } from '../../src/services/smtpErrors.js';
import { encrypt, decrypt } from '../../src/lib/crypto.js';

test('lead hygiene: dedupe (case-insensitive), invalid reported, quotes stripped', () => {
  const r = normalizeLeads([
    'a@x.com',
    'A@X.COM',
    ' "b@y.io" ',
    '<c@z.dev>',
    'nope',
    'broken@',
    '@nouser.com',
    '',
    'a@x.com',
  ]);
  assert.deepEqual(r.valid, ['a@x.com', 'b@y.io', 'c@z.dev']);
  assert.equal(r.duplicates, 2);
  assert.deepEqual(r.invalid, ['nope', 'broken@', '@nouser.com']);
});

test('email validation edge cases', () => {
  assert.equal(isValidEmail('first.last+tag@sub.domain.co.in'), true);
  assert.equal(isValidEmail('no-tld@localhost'), false);
  assert.equal(isValidEmail(`${'a'.repeat(65)}@x.com`), false);
  assert.equal(isValidEmail('a@-bad.com'), false);
});

test('extract emails from messy CSV with names and other columns', () => {
  const csv = 'name,email,company\nRavi,ravi@acme.com,Acme\n"Sita","sita@globex.io",Globex\nbad row\n';
  const found = normalizeLeads(extractFromText(csv)).valid;
  assert.deepEqual(found, ['ravi@acme.com', 'sita@globex.io']);
});

test('SMTP error classification', () => {
  assert.equal(classifySmtpError({ responseCode: 421 }), 'transient');
  assert.equal(classifySmtpError({ responseCode: 451 }), 'transient');
  assert.equal(classifySmtpError({ responseCode: 550 }), 'permanent');
  assert.equal(classifySmtpError({ code: 'EAUTH', responseCode: 535 }), 'permanent');
  assert.equal(classifySmtpError({ code: 'ECONNREFUSED' }), 'transient');
  assert.equal(classifySmtpError({ code: 'ETIMEDOUT', command: 'CONN' }), 'transient');
  assert.equal(classifySmtpError({ code: 'ETIMEDOUT', command: 'DATA' }), 'uncertain');
  assert.equal(classifySmtpError({ code: 'ESOCKET' }), 'uncertain');
  assert.equal(classifySmtpError(new Error('???')), 'transient');
});

test('AES-256-GCM roundtrip and tamper detection', () => {
  const key = crypto.randomBytes(32).toString('hex');
  const enc = encrypt('https://hooks.slack.com/services/T/B/x', key);
  assert.equal(decrypt(enc, key), 'https://hooks.slack.com/services/T/B/x');
  assert.notEqual(encrypt('same', key), encrypt('same', key), 'random IV each time');
  const buf = Buffer.from(enc, 'base64');
  buf[buf.length - 1] ^= 1;
  assert.throws(() => decrypt(buf.toString('base64'), key));
});
