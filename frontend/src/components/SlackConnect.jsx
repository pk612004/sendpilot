'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, SLACK_INSTALL_URL } from '@/lib/api';
import { Button, Popover } from './ui';
import { SlackLogo } from './icons';
import { useToast } from './ui/Toast';

/** Sidebar item: connect Slack (real OAuth), send a test message, disconnect. */
export function SlackConnect() {
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(
    () =>
      api
        .slackStatus()
        .then(setStatus)
        .catch(() => setStatus(null)),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  if (!status?.enabled) return null;

  if (!status.connected) {
    return (
      <button
        onClick={() => {
          window.location.href = SLACK_INSTALL_URL;
        }}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
      >
        <SlackLogo /> <span className="flex-1 text-left">Connect Slack</span>
      </button>
    );
  }

  const test = async () => {
    setBusy(true);
    try {
      const r = await api.slackTest();
      toast(
        r.result === 'sent' ? 'success' : 'error',
        r.result === 'sent' ? 'Test message sent to Slack' : `Slack: ${r.result}`,
      );
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Slack test failed');
      load();
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    await api.slackDisconnect();
    toast('info', 'Slack disconnected');
    setOpen(false);
    load();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
      >
        <SlackLogo /> <span className="flex-1 truncate text-left">{status.channel ?? 'Slack'}</span>
        <span className="h-2 w-2 rounded-full bg-brand-600" aria-label="connected" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="bottom-11 left-0 w-60 p-3 text-sm">
        <p className="text-gray-900">
          Connected to <b>{status.team}</b>
        </p>
        <p className="mb-3 mt-0.5 text-xs text-gray-500">
          Alerts go to {status.channel} when a sender hits its hourly limit.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" pill className="flex-1 px-2 py-1.5 text-xs" loading={busy} onClick={test}>
            Send test
          </Button>
          <Button variant="danger" pill className="flex-1 px-2 py-1.5 text-xs" onClick={disconnect}>
            Disconnect
          </Button>
        </div>
      </Popover>
    </div>
  );
}
