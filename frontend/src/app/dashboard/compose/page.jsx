'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useDashboard } from '@/lib/dashboard-context';
import { estimatePlan, formatLong } from '@/lib/format';
import { htmlToText } from '@/lib/sanitize';
import { RecipientInput } from '@/components/compose/RecipientInput';
import { SenderSelect } from '@/components/compose/SenderSelect';
import { SendLaterPopover } from '@/components/compose/SendLaterPopover';
import { RichEditor } from '@/components/compose/RichEditor';
import { Button, IconButton } from '@/components/ui';
import { ArrowLeftIcon, ClockIcon, PaperclipIcon } from '@/components/icons';
import { useToast } from '@/components/ui/Toast';

const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

/** Full-page compose: senders, recipients, subject, limits, editor and send time. */
export default function ComposePage() {
  const router = useRouter();
  const toast = useToast();
  const { config, senders, reloadSenders, refreshStats } = useDashboard();
  const editor = useRef(null);

  const [senderIds, setSenderIds] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [subject, setSubject] = useState('');
  const [delay, setDelay] = useState(''); // seconds; empty = server minimum
  const [hourly, setHourly] = useState(''); // empty = server maximum
  const [sendAt, setSendAt] = useState(null);
  const [laterOpen, setLaterOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bodyTick, setBodyTick] = useState(0); // re-render on typing (for validation hints)
  // One key per compose screen: double-clicks and retries can never create two campaigns.
  const [idemKey] = useState(newKey);

  useEffect(() => {
    setSenderIds((ids) => (ids.length ? ids : senders.map((s) => s.id)));
  }, [senders]);

  const delaySec = delay === '' ? config.minDelayBetweenEmailsMs / 1000 : Number(delay);
  const hourlyLimit = hourly === '' ? config.maxEmailsPerHourPerSender : Number(hourly);

  const plan = useMemo(() => {
    if (!recipients.length) return null;
    const delayMs = Math.max(delaySec * 1000, config.minDelayBetweenEmailsMs);
    const limit = Math.min(Math.max(hourlyLimit, 1), config.maxEmailsPerHourPerSender);
    return estimatePlan(
      recipients.length,
      Math.max(senderIds.length, 1),
      Math.max(sendAt?.getTime() ?? Date.now(), Date.now()),
      delayMs,
      limit,
    );
  }, [recipients, delaySec, hourlyLimit, senderIds, sendAt, config]);

  const send = async () => {
    const html = editor.current?.getHtml() ?? '';
    const problems = [
      !senderIds.length && 'pick at least one sender',
      !recipients.length && 'add recipients or upload a list',
      recipients.length > config.maxLeadsPerCampaign && `max ${config.maxLeadsPerCampaign} recipients`,
      !subject.trim() && 'add a subject',
      !htmlToText(html) && 'write a message',
      (Number.isNaN(delaySec) || delaySec < 0 || delaySec > 3600) && 'delay must be 0–3600 seconds',
      (Number.isNaN(hourlyLimit) || hourlyLimit < 1) && 'hourly limit must be at least 1',
    ].filter(Boolean);
    if (problems.length) return toast('error', `Please ${problems.join(', ')}.`);

    setSubmitting(true);
    try {
      const s = await api.schedule(
        {
          subject: subject.trim(),
          body: html,
          leads: recipients,
          startAt: (sendAt ?? new Date()).toISOString(),
          delaySeconds: delaySec,
          hourlyLimit,
          senderIds,
        },
        idemKey,
      );
      if (s.replayed) toast('info', 'Already scheduled (duplicate submit ignored).');
      else {
        const extra = [
          s.duplicates && `${s.duplicates} duplicates removed`,
          s.invalid && `${s.invalid} invalid skipped`,
        ]
          .filter(Boolean)
          .join(', ');
        toast(
          'success',
          `Scheduled ${s.accepted} email${s.accepted === 1 ? '' : 's'} across ${s.hourWindows} hour window${s.hourWindows === 1 ? '' : 's'}${extra ? ` (${extra})` : ''}.`,
        );
        s.warnings.forEach((w) => toast('info', w));
      }
      refreshStats();
      router.push('/dashboard?tab=scheduled');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not schedule');
      setSubmitting(false);
    }
  };

  const addSender = async () => {
    try {
      const s = await api.addSender(`Sender ${senders.length + 1}`);
      await reloadSenders();
      setSenderIds((ids) => [...ids, s.id]);
      toast('success', `New Ethereal sender ${s.email} created`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not create sender');
    }
  };

  void bodyTick;
  const label = 'w-[150px] shrink-0 text-[13px] text-gray-700';

  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center gap-3 px-4 py-3">
        <IconButton label="Back" onClick={() => router.push('/dashboard')}>
          <ArrowLeftIcon size={18} />
        </IconButton>
        <h1 className="flex-1 text-lg text-gray-900">Compose New Email</h1>
        <IconButton label="Attachments are coming soon" disabled>
          <PaperclipIcon size={16} />
        </IconButton>
        <div className="relative">
          <IconButton
            label="Send later"
            onClick={() => setLaterOpen((o) => !o)}
            className={sendAt ? 'text-brand-700' : ''}
          >
            <ClockIcon size={16} />
          </IconButton>
          <SendLaterPopover
            open={laterOpen}
            onClose={() => setLaterOpen(false)}
            value={sendAt}
            onDone={setSendAt}
          />
        </div>
        <Button variant="outline" pill onClick={send} loading={submitting} className="px-5 py-1.5">
          {sendAt ? 'Send Later' : 'Send'}
        </Button>
      </header>

      <div className="mx-auto max-w-[780px] px-6 pb-16 pt-4">
        <div className="space-y-1">
          <div className="flex items-center py-2">
            <span className={label}>From</span>
            <SenderSelect senders={senders} value={senderIds} onChange={setSenderIds} onAdd={addSender} />
          </div>

          <div className="flex items-start">
            <span className={`${label} pt-3`}>To</span>
            <div className="min-w-0 flex-1">
              <RecipientInput
                value={recipients}
                onChange={setRecipients}
                maxLeads={config.maxLeadsPerCampaign}
              />
            </div>
          </div>

          <div className="flex items-center">
            <span className={label}>Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              maxLength={998}
              className="flex-1 border-b border-gray-200 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 py-3">
            <label className="flex items-center gap-3">
              <span className="text-[13px] text-gray-700">Delay between 2 emails</span>
              <input
                value={delay}
                onChange={(e) => setDelay(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                placeholder={String(config.minDelayBetweenEmailsMs / 1000).padStart(2, '0')}
                title="Seconds between two sends (server minimum applies)"
                className="w-14 rounded-md border border-gray-200 px-2 py-1.5 text-center text-sm placeholder:text-gray-300 focus:border-brand-500 focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-3">
              <span className="text-[13px] text-gray-700">Hourly Limit</span>
              <input
                value={hourly}
                onChange={(e) => setHourly(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                placeholder={String(config.maxEmailsPerHourPerSender)}
                title="Max emails per hour per sender (server maximum applies)"
                className="w-16 rounded-md border border-gray-200 px-2 py-1.5 text-center text-sm placeholder:text-gray-300 focus:border-brand-500 focus:outline-none"
              />
            </label>
          </div>
        </div>

        <RichEditor ref={editor} onChange={() => setBodyTick((t) => t + 1)} />

        {/* Plan preview: shows how the emails will be spread before you send */}
        <div className="mt-3 text-xs text-gray-500">
          {sendAt ? (
            <>
              Starts <b className="text-gray-700">{formatLong(sendAt.toISOString())}</b>.{' '}
            </>
          ) : (
            <>
              Starts <b className="text-gray-700">now</b>.{' '}
            </>
          )}
          {plan && (
            <>
              ~{plan.perSender} per sender across <b className="text-gray-700">{plan.windows}</b> hour window
              {plan.windows > 1 ? 's' : ''}, last one around{' '}
              <b className="text-gray-700">{formatLong(plan.lastAt.toISOString())}</b>.
              {plan.windows > 1 &&
                ' The hourly limit moves the rest to later windows automatically; nothing is dropped.'}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
