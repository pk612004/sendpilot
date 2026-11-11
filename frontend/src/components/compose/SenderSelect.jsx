'use client';

import { useState } from 'react';
import { Popover } from '../ui';
import { ChevronDownIcon } from '../icons';

/**
 * "From" dropdown. Multi-select: picking several senders rotates the
 * campaign across them (each sender has its own hourly limit).
 */
export function SenderSelect({ senders, value, onChange, onAdd }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const selected = senders.filter((s) => value.includes(s.id));
  const label =
    selected.length === 0
      ? 'Choose sender'
      : selected.length === 1
        ? selected[0].email
        : `${selected[0].email} +${selected.length - 1}`;

  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex max-w-full items-center gap-2 rounded-md bg-field px-3 py-1.5 text-sm text-gray-900 hover:bg-gray-200/70"
      >
        <span className="truncate">{label}</span> <ChevronDownIcon size={14} className="text-gray-500" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="left-0 top-10 w-80 p-1">
        <p className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-gray-400">
          Rotate across selected senders
        </p>
        {senders.map((s) => (
          <label
            key={s.id}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={value.includes(s.id)}
              onChange={() => toggle(s.id)}
              className="accent-brand-600"
            />
            <span className="truncate">{s.email}</span>
          </label>
        ))}
        <button
          disabled={adding}
          onClick={async () => {
            setAdding(true);
            try {
              await onAdd();
            } finally {
              setAdding(false);
            }
          }}
          className="mt-1 w-full rounded-lg px-3 py-1.5 text-left text-sm text-brand-700 hover:bg-brand-50 disabled:opacity-50"
        >
          {adding ? 'Creating Ethereal inbox…' : '+ Add sender'}
        </button>
      </Popover>
    </div>
  );
}
