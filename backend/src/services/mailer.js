import { promises as dns } from 'node:dns';
import { randomBytes } from 'node:crypto';
import { env, simulateMail } from '../config/env.js'; // must load before nodemailer (sets ETHEREAL_CACHE)
import nodemailer from 'nodemailer';
import { decrypt } from '../lib/crypto.js';
import { normaliseBody } from '../lib/html.js';
import { log, errMsg } from '../lib/logger.js';

/** Deterministic Message-ID: if a send is ever retried, receiving servers can dedupe it. */
export function messageIdFor(emailId, senderEmail) {
  const domain = senderEmail.split('@')[1] ?? 'sendpilot.local';
  return `<sp-email-${emailId}@${domain}>`;
}

/** Wrap the (already sanitised) body HTML in a simple email-safe container. */
function wrapHtml(html) {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${html}</div>`;
}

/**
 * Resolve the SMTP host with the OS resolver (the same one the browser uses).
 * Nodemailer's own lookup uses c-ares, which can time out on some Windows/ISP setups
 * ("queryA ETIMEOUT"). We connect to the IP but still validate TLS against the real
 * hostname (servername), so security is unchanged.
 */
async function resolveHost(hostname) {
  try {
    const { address } = await dns.lookup(hostname, { family: 4 });
    return { host: address, servername: hostname };
  } catch (err) {
    log.warn('smtp_dns_lookup_failed_using_hostname', { hostname, error: errMsg(err) });
    return { host: hostname };
  }
}

/**
 * Demo mailer for hosts that block SMTP ports (most free cloud plans).
 * Everything else stays real: scheduling, limits, status changes, Slack alerts.
 * Only the last step, talking to the SMTP server, is replaced by a short wait.
 */
export function createSimulatedMailer() {
  return {
    async send(sender, mail) {
      await new Promise((r) => setTimeout(r, 200 + Math.floor(Math.random() * 400)));
      log.info('mail_simulated', { emailId: mail.emailId, to: mail.to });
      return { messageId: messageIdFor(mail.emailId, sender.email), previewUrl: null };
    },
  };
}

/** Picks the mailer from MAIL_MODE. */
export function createMailer() {
  return simulateMail ? createSimulatedMailer() : createSmtpMailer();
}

export function createSmtpMailer() {
  // One pooled transport per sender, reused across jobs (no TCP+TLS handshake per email).
  const transports = new Map();

  function transportFor(s) {
    let t = transports.get(s.id);
    if (!t) {
      t = resolveHost(s.smtp_host).then(({ host, servername }) =>
        nodemailer.createTransport({
          host,
          // connect to the IP, but check the TLS certificate against the real hostname
          tls: servername ? { servername } : undefined,
          port: s.smtp_port,
          secure: Boolean(s.smtp_secure),
          auth: { user: s.smtp_user, pass: decrypt(s.smtp_pass_enc, env.ENCRYPTION_KEY) },
          pool: true,
          maxConnections: 2,
          connectionTimeout: 15_000,
          socketTimeout: 30_000,
        }),
      );
      transports.set(s.id, t);
    }
    return t;
  }

  return {
    async send(sender, mail) {
      const messageId = messageIdFor(mail.emailId, sender.email);
      const body = normaliseBody(mail.body); // sanitises editor HTML, escapes plain text
      const transport = await transportFor(sender);
      const info = await transport.sendMail({
        from: { name: sender.name, address: sender.email },
        to: mail.to,
        subject: mail.subject,
        text: body.text,
        html: wrapHtml(body.html),
        messageId,
        headers: { 'X-SendPilot-Email-Id': String(mail.emailId) },
      });
      const preview = nodemailer.getTestMessageUrl(info);
      return { messageId, previewUrl: typeof preview === 'string' ? preview : null };
    },
  };
}

/** Create a fresh Ethereal test inbox (fake SMTP: emails are captured, never delivered). */
export async function createEtherealAccount() {
  if (simulateMail) {
    // no SMTP in demo mode, so a local placeholder sender is enough
    const user = `sender-${randomBytes(4).toString('hex')}@sendpilot.demo`;
    return {
      email: user,
      smtp_host: 'simulated',
      smtp_port: 0,
      smtp_secure: false,
      smtp_user: user,
      smtp_pass: randomBytes(12).toString('hex'),
    };
  }
  const acc = await nodemailer.createTestAccount();
  return {
    email: acc.user,
    smtp_host: acc.smtp.host,
    smtp_port: acc.smtp.port,
    smtp_secure: acc.smtp.secure,
    smtp_user: acc.user,
    smtp_pass: acc.pass,
  };
}
