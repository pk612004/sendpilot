import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DelayedError, UnrecoverableError } from 'bullmq';
import { createEmailProcessor } from '../../src/workers/emailProcessor.js';

function makeWorld(opts = {}) {
  const row = {
    id: 1,
    seq: 7,
    user_id: 10,
    status: opts.status ?? 'scheduled',
    to_email: 'lead@x.com',
    subject: 'Hi',
    body: 'Hello',
    delay_ms: 1000,
    hourly_limit: 500,
    sender_id: 3,
    sender_name: 'S',
    sender_email: 's@ethereal.email',
    smtp_host: 'h',
    smtp_port: 587,
    smtp_secure: 0,
    smtp_user: 'u',
    smtp_pass_enc: 'x',
  };
  const calls = { sends: 0, notifies: 0, deferredTo: null, acquireArgs: null };

  const repo = {
    getForSend: async () => ({ ...row }),
    claim: async () => {
      if (row.status !== 'scheduled') return false;
      row.status = 'sending';
      return true;
    },
    markSent: async () => {
      if (row.status === 'sending' || row.status === 'uncertain') row.status = 'sent';
    },
    release: async () => {
      if (row.status === 'sending') row.status = 'scheduled';
    },
    markFailed: async () => {
      if (row.status === 'scheduled' || row.status === 'sending') row.status = 'failed';
    },
    markUncertain: async () => {
      if (row.status === 'sending') row.status = 'uncertain';
    },
    markDeferred: async () => {},
    listScheduled: async () => [],
    markStaleSendingUncertain: async () => 0,
  };

  const deps = {
    repo,
    mailer: {
      send: async () => {
        calls.sends++;
        if (opts.sendDelayMs) await new Promise((r) => setTimeout(r, opts.sendDelayMs));
        if (opts.sendError) throw opts.sendError;
        return { messageId: '<m>', previewUrl: 'https://ethereal.email/message/abc' };
      },
    },
    limiter: {
      reserve: async () => [],
      acquire: async (...args) => {
        calls.acquireArgs = args;
        return opts.acquire ?? { allowed: true, at: Date.now(), hour: 1, count: 1 };
      },
    },
    config: { maxPerHourPerSender: 200, minDelayMs: 2000, jobAttempts: 3 },
    notifyRateLimit: async () => {
      calls.notifies++;
    },
    onStatusChange: async () => {},
    sleep: async () => {},
  };
  return { row, calls, process: createEmailProcessor(deps) };
}

function fakeJob(attemptsMade = 0) {
  const job = {
    data: { emailId: 1, seq: 7 },
    attemptsMade,
    opts: { attempts: 3 },
    movedTo: null,
    moveToDelayed: async (ts) => {
      job.movedTo = ts;
    },
  };
  return job;
}

test('happy path: sends exactly once and marks sent', async () => {
  const w = makeWorld();
  await w.process(fakeJob());
  assert.equal(w.calls.sends, 1);
  assert.equal(w.row.status, 'sent');
});

test('idempotency: an already-sent email is never sent again (duplicate job / re-enqueue)', async () => {
  const w = makeWorld({ status: 'sent' });
  const r = await w.process(fakeJob());
  assert.deepEqual(r, { skipped: 'sent' });
  assert.equal(w.calls.sends, 0);
});

test('race: two workers process the same email in parallel -> only ONE SMTP send', async () => {
  const w = makeWorld({ sendDelayMs: 20 });
  await Promise.all([w.process(fakeJob()), w.process(fakeJob())]);
  assert.equal(w.calls.sends, 1);
  assert.equal(w.row.status, 'sent');
});

test('crash recovery: row left in "sending" is marked uncertain, NOT resent', async () => {
  const w = makeWorld({ status: 'sending' });
  const r = await w.process(fakeJob());
  assert.deepEqual(r, { skipped: 'uncertain_after_crash' });
  assert.equal(w.calls.sends, 0);
  assert.equal(w.row.status, 'uncertain');
});

test('hourly limit hit: job is moved to next window (not dropped, not failed) + Slack notify', async () => {
  const nextWindow = Date.UTC(2026, 10, 7, 11);
  const w = makeWorld({ acquire: { allowed: false, at: nextWindow, hour: 1, count: 200 } });
  const job = fakeJob();
  await assert.rejects(w.process(job), (e) => e instanceof DelayedError);
  assert.equal(job.movedTo, nextWindow + 7, 'next window + seq offset to keep order');
  assert.equal(w.calls.sends, 0);
  assert.equal(w.calls.notifies, 1);
  assert.equal(w.row.status, 'scheduled');
});

test('the send that uses the LAST slot of the window triggers the Slack alert (and still sends)', async () => {
  const w = makeWorld({ acquire: { allowed: true, at: Date.now(), hour: 1, count: 200 } });
  await w.process(fakeJob());
  assert.equal(w.calls.sends, 1);
  assert.equal(w.calls.notifies, 1);
});

test('a normal send below the limit does not notify', async () => {
  const w = makeWorld({ acquire: { allowed: true, at: Date.now(), hour: 1, count: 12 } });
  await w.process(fakeJob());
  assert.equal(w.calls.notifies, 0);
});

test('env caps win: limit = min(user, env), gap = max(user, env)', async () => {
  const w = makeWorld();
  await w.process(fakeJob());
  assert.deepEqual(w.calls.acquireArgs, [3, 200, 2000]); // user asked 500/h & 1s; env caps 200/h & 2s
});

test('transient SMTP error (4xx): row released for retry, error rethrown for BullMQ backoff', async () => {
  const w = makeWorld({ sendError: Object.assign(new Error('try later'), { responseCode: 451 }) });
  await assert.rejects(w.process(fakeJob(0)), /try later/);
  assert.equal(w.row.status, 'scheduled');
});

test('transient error on the LAST attempt: marked failed, unrecoverable', async () => {
  const w = makeWorld({ sendError: Object.assign(new Error('try later'), { responseCode: 451 }) });
  await assert.rejects(w.process(fakeJob(2)), (e) => e instanceof UnrecoverableError);
  assert.equal(w.row.status, 'failed');
});

test('permanent SMTP error (5xx): failed immediately, no retries', async () => {
  const w = makeWorld({ sendError: Object.assign(new Error('no such user'), { responseCode: 550 }) });
  await assert.rejects(w.process(fakeJob(0)), (e) => e instanceof UnrecoverableError);
  assert.equal(w.row.status, 'failed');
});

test('timeout mid-DATA: marked uncertain, never retried (at-most-once)', async () => {
  const w = makeWorld({
    sendError: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT', command: 'DATA' }),
  });
  const r = await w.process(fakeJob(0));
  assert.deepEqual(r, { uncertain: true });
  assert.equal(w.row.status, 'uncertain');
});
