'use client';

import { useEffect, useState } from 'react';
import { toLocalInputValue } from '@/lib/format';
import { Popover } from '../ui';

function tomorrowAt(h, m = 0) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d;
}

const PRESETS = [
  { label: 'Tomorrow', at: () => tomorrowAt(9) },
  { label: 'Tomorrow, 10:00 AM', at: () => tomorrowAt(10) },
  { label: 'Tomorrow, 11:00 AM', at: () => tomorrowAt(11) },
  { label: 'Tomorrow, 3:00 PM', at: () => tomorrowAt(15) },
];

/** "Send Later" panel: custom date & time, quick presets, Cancel / Done. */
export function SendLaterPopover({ open, onClose, value, onDone }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) {
      setDraft(value ? toLocalInputValue(value) : '');
      setError(null);
    }
  }, [open, value]);

  const done = () => {
    if (!draft) {
      onDone(null);
      onClose();
      return;
    }
    const d = new Date(draft);
    if (Number.isNaN(d.getTime())) return setError('Pick a valid date and time');
    if (d.getTime() < Date.now() - 60_000) return setError('That time is in the past');
    onDone(d);
    onClose();
  };

  return (
    <Popover open={open} onClose={onClose} className="right-0 top-11 w-64 p-3">
      <h3 className="mb-2 text-sm font-medium text-gray-900">Send Later</h3>
      <label className="flex items-center gap-2 border-b border-gray-200 pb-1.5">
        <input
          type="datetime-local"
          value={draft}
          min={toLocalInputValue(new Date())}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Pick date & time"
          className="min-w-0 flex-1 bg-transparent text-xs text-gray-700 focus:outline-none"
        />
      </label>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <ul className="mt-2 space-y-0.5">
        {PRESETS.map((p) => {
          const v = toLocalInputValue(p.at());
          return (
            <li key={p.label}>
              <button
                onClick={() => setDraft(v)}
                className={`w-full rounded-md px-1 py-1.5 text-left text-xs hover:bg-gray-50 ${draft === v ? 'font-medium text-brand-700' : 'text-gray-700'}`}
              >
                {p.label}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex items-center justify-end gap-3">
        <button onClick={onClose} className="text-xs font-medium text-gray-700 hover:text-gray-900">
          Cancel
        </button>
        <button
          onClick={done}
          className="rounded-full border border-brand-600 px-4 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
        >
          Done
        </button>
      </div>
    </Popover>
  );
}
