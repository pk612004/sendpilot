import { DelayedError, UnrecoverableError } from 'bullmq';
import { classifySmtpError } from '../services/smtpErrors.js';
import { deferTimestamp } from '../services/slotPlanner.js';
import { errMsg, log } from '../lib/logger.js';

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The send pipeline for ONE email. Order matters:
 *
 *  1. Read DB state           -> skip anything not 'scheduled' (layer 2 of idempotency)
 *  2. Acquire rate-limit slot -> hourly limit + min gap, atomically in Redis
 *       denied => move job to next window (never dropped), notify Slack once
 *  3. Claim the row           -> UPDATE ... WHERE status='scheduled' (only one winner)
 *  4. SMTP send               -> deterministic Message-ID
 *  5. Record the result       -> sent / retry / failed / uncertain
 *
 * Dependencies are injected so the whole thing is testable with fakes.
 */
export function createEmailProcessor(deps) {
  const sleep = deps.sleep ?? defaultSleep;

  return async function processEmail(job, token) {
    const { emailId } = job.data;
    const email = await deps.repo.getForSend(emailId);

    // 1. Idempotency guard
    if (!email) return { skipped: 'not_found' };
    if (email.status === 'sent' || email.status === 'failed' || email.status === 'uncertain') {
      return { skipped: email.status };
    }
    if (email.status === 'sending') {
      // BullMQ holds a lock per job, so a live duplicate is impossible. Seeing 'sending' here means
      // the previous attempt's process died mid-send (stalled job). SMTP may have accepted
      // it, so we do NOT resend. A duplicate cold email hurts more than a missed one.
      await deps.repo.markUncertain(
        emailId,
        'Worker crashed during send; not resent to avoid duplicate (at-most-once)',
      );
      await deps.onStatusChange(emailId, { status: 'uncertain' });
      return { skipped: 'uncertain_after_crash' };
    }

    // 2. Rate limit (env cap always wins over the user's chosen value)
    const limit = Math.min(email.hourly_limit, deps.config.maxPerHourPerSender);
    const gap = Math.max(email.delay_ms, deps.config.minDelayMs);
    const slot = await deps.limiter.acquire(email.sender_id, limit, gap);

    if (!slot.allowed) {
      const until = deferTimestamp(slot.at, email.seq);
      await deps.repo.markDeferred(
        emailId,
        new Date(until),
        `Hourly limit (${limit}/h) reached; moved to next window`,
      );
      await deps.onStatusChange(emailId, { send_at: new Date(until).toISOString() });
      await deps.notifyRateLimit({
        userId: email.user_id,
        senderId: email.sender_id,
        senderEmail: email.sender_email,
        hour: slot.hour,
        limit,
      });
      // Re-delay the SAME job (same id) instead of creating a new one. It does not count as a failed attempt.
      await job.moveToDelayed(until, token);
      throw new DelayedError();
    }

    // This send uses the LAST slot of the window => the limit is reached right now.
    // (With schedule-time planning, later emails are already in the next window, so this
    // is the moment that matters. jobId dedupe keeps it to one alert per sender per hour.)
    if (slot.count >= limit) {
      await deps.notifyRateLimit({
        userId: email.user_id,
        senderId: email.sender_id,
        senderEmail: email.sender_email,
        hour: slot.hour,
        limit,
      });
    }

    const wait = slot.at - Date.now();
    if (wait > 0) await sleep(wait); // bounded: at most (active jobs for this sender) x gap

    // 3. Claim (layer 3 of idempotency: DB compare-and-set)
    const claimed = await deps.repo.claim(emailId);
    if (!claimed) return { skipped: 'claimed_by_another_worker' };
    await deps.onStatusChange(emailId, { status: 'sending' });

    // 4 + 5. Send and record
    try {
      const result = await deps.mailer.send(
        {
          id: email.sender_id,
          name: email.sender_name,
          email: email.sender_email,
          smtp_host: email.smtp_host,
          smtp_port: email.smtp_port,
          smtp_secure: email.smtp_secure,
          smtp_user: email.smtp_user,
          smtp_pass_enc: email.smtp_pass_enc,
        },
        { emailId, to: email.to_email, subject: email.subject, body: email.body },
      );
      await deps.repo.markSent(emailId, result.messageId, result.previewUrl);
      await deps.onStatusChange(emailId, { status: 'sent', sent_at: new Date().toISOString() });
      log.info('email_sent', { emailId, to: email.to_email, sender: email.sender_email });
      return { sent: true, messageId: result.messageId };
    } catch (err) {
      const kind = classifySmtpError(err);
      const msg = `${kind}: ${errMsg(err)}`;
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? deps.config.jobAttempts);

      if (kind === 'uncertain') {
        await deps.repo.markUncertain(emailId, msg);
        await deps.onStatusChange(emailId, { status: 'uncertain' });
        log.warn('email_uncertain', { emailId, error: msg });
        return { uncertain: true };
      }
      if (kind === 'permanent' || lastAttempt) {
        await deps.repo.markFailed(emailId, msg);
        await deps.onStatusChange(emailId, { status: 'failed' });
        log.warn('email_failed', { emailId, error: msg, attempt: job.attemptsMade + 1 });
        throw new UnrecoverableError(msg);
      }
      // transient: give the row back and let BullMQ retry with exponential backoff
      await deps.repo.release(emailId, msg);
      log.warn('email_retry', { emailId, error: msg, attempt: job.attemptsMade + 1 });
      throw err;
    }
  };
}
