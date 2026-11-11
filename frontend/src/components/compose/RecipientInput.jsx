'use client';

import { useRef, useState } from 'react';
import { parseLeads } from '@/lib/leads';
import { UploadIcon, XIcon } from '../icons';

const VISIBLE = 3;

/**
 * "To" field: green chips, type + Enter/comma to add, paste many,
 * "Upload List" for CSV/TXT, and "+N" when there are more than 3.
 * Every addition goes through the same parser (dedupe + validation).
 */
export function RecipientInput({ value, onChange, maxLeads }) {
  const fileRef = useRef(null);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [report, setReport] = useState(null);

  const add = (text, file) => {
    const parsed = parseLeads(`${value.join(',')},${text}`);
    const added = parsed.valid.length - value.length;
    // duplicates already in the list count as duplicates too
    onChange(parsed.valid);
    const invalid = parseLeads(text).invalid;
    setReport({ added, duplicates: parsed.duplicates, invalid, file });
  };

  const onKey = (e) => {
    if ((e.key === 'Enter' || e.key === ',' || e.key === ' ' || e.key === 'Tab') && draft.trim()) {
      e.preventDefault();
      add(draft);
      setDraft('');
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const onFile = async (f) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setReport({ added: 0, duplicates: 0, invalid: ['File too large (max 5 MB)'] });
      return;
    }
    add(await f.text(), f.name);
    if (fileRef.current) fileRef.current.value = '';
  };

  const shown = expanded ? value : value.slice(0, VISIBLE);
  const hidden = value.length - shown.length;

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-gray-200 py-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {shown.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1 rounded-full border border-brand-500/60 bg-brand-50 px-2 py-0.5 text-xs text-gray-800"
            >
              {email}
              <button
                aria-label={`Remove ${email}`}
                onClick={() => onChange(value.filter((v) => v !== email))}
                className="text-gray-400 hover:text-gray-700"
              >
                <XIcon size={11} />
              </button>
            </span>
          ))}
          {hidden > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="rounded-full border border-brand-500/60 bg-brand-50 px-2 py-0.5 text-xs text-gray-800"
            >
              +{hidden.toLocaleString()}
            </button>
          )}
          {expanded && value.length > VISIBLE && (
            <button onClick={() => setExpanded(false)} className="text-xs text-gray-500 hover:underline">
              show less
            </button>
          )}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            onPaste={(e) => {
              const t = e.clipboardData.getData('text');
              if (/[\s,;]/.test(t)) {
                e.preventDefault();
                add(t);
              }
            }}
            onBlur={() => {
              if (draft.trim()) {
                add(draft);
                setDraft('');
              }
            }}
            placeholder={value.length ? '' : 'recipient@example.com'}
            aria-label="Recipients"
            className="min-w-[160px] flex-1 bg-transparent py-0.5 text-sm placeholder:text-gray-400 focus:outline-none"
          />
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-600"
        >
          <UploadIcon size={14} /> Upload List
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>

      {/* show how many addresses were found */}
      {(value.length > 0 || report) && (
        <p className="mt-1 text-xs text-gray-500">
          <b className="text-brand-700">{value.length.toLocaleString()}</b> recipient
          {value.length === 1 ? '' : 's'}
          {report?.file && (
            <>
              {' '}
              · from <span className="text-gray-700">{report.file}</span>
            </>
          )}
          {report && report.duplicates > 0 && (
            <>
              {' '}
              · {report.duplicates} duplicate{report.duplicates > 1 ? 's' : ''} removed
            </>
          )}
          {report && report.invalid.length > 0 && (
            <>
              {' '}
              ·{' '}
              <span className="text-red-600" title={report.invalid.slice(0, 10).join(', ')}>
                {report.invalid.length} invalid skipped
              </span>
            </>
          )}
          {value.length > maxLeads && (
            <span className="text-red-600"> · max {maxLeads.toLocaleString()} per campaign</span>
          )}
        </p>
      )}
    </div>
  );
}
