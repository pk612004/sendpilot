'use client';

import { useEffect, useState } from 'react';
import { formatPillTime } from '@/lib/format';
import { ClockIcon, StarIcon } from './icons';

/** Status pill: orange time pill for scheduled , grey "Sent", red/violet for problems. */
export function StatusPill({ item }) {
  const base = 'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium';
  switch (item.status) {
    case 'scheduled':
      return (
        <span
          className={`${base} border border-orange-200 bg-orange-50 text-orange-700`}
          title={
            item.deferred_count
              ? (item.last_error ?? 'Moved to the next hour window by the rate limiter')
              : 'Scheduled'
          }
        >
          <ClockIcon size={11} /> {formatPillTime(item.send_at)}
          {item.deferred_count ? ' · deferred' : ''}
        </span>
      );
    case 'sending':
      return <span className={`${base} bg-amber-100 text-amber-800`}>Sending…</span>;
    case 'sent':
      return <span className={`${base} bg-gray-100 text-gray-600`}>Sent</span>;
    case 'failed':
      return (
        <span className={`${base} bg-red-50 text-red-700`} title={item.last_error ?? ''}>
          Failed
        </span>
      );
    case 'uncertain':
      return (
        <span
          className={`${base} bg-violet-50 text-violet-700`}
          title="The process stopped while handing this email to SMTP. It may have been delivered, so it was NOT resent (prevents duplicates)."
        >
          Uncertain
        </span>
      );
  }
}

/* Stars are a per-viewer convenience kept in this browser only (not part of the backend). */
const STAR_KEY = 'sendpilot-starred';
function readStars() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STAR_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}
export function useStars() {
  const [stars, setStars] = useState(new Set());
  useEffect(() => {
    setStars(readStars());
  }, []);
  const toggle = (id) => {
    setStars((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(STAR_KEY, JSON.stringify([...next]));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };
  return { stars, toggle };
}

export function EmailListRow({ item, starred, onStar, onOpen }) {
  const timeLabel = item.status === 'scheduled' ? null : formatPillTime(item.sent_at ?? item.send_at);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="group grid cursor-pointer grid-cols-[minmax(140px,200px)_1fr_auto] items-center gap-4 border-b border-gray-100 px-4 py-3 hover:bg-gray-50"
    >
      <div className="truncate text-[13px] text-gray-900">To: {item.to_email}</div>
      <div className="flex min-w-0 items-center gap-2 text-[13px]">
        <StatusPill
          item={{
            status: item.status,
            send_at: item.send_at,
            last_error: item.last_error ?? null,
            deferred_count: item.deferred_count ?? 0,
          }}
        />
        <span className="shrink-0 truncate font-medium text-gray-900" style={{ maxWidth: '45%' }}>
          {item.subject}
        </span>
        {item.body_preview && <span className="min-w-0 truncate text-gray-400">- {item.body_preview}</span>}
      </div>
      <div className="flex items-center gap-3">
        {timeLabel && <span className="hidden text-xs text-gray-400 sm:inline">{timeLabel}</span>}
        <button
          aria-label={starred ? 'Unstar' : 'Star'}
          onClick={(e) => {
            e.stopPropagation();
            onStar();
          }}
          className={starred ? 'text-amber-400' : 'text-gray-300 hover:text-gray-500'}
        >
          <StarIcon size={15} filled={starred} />
        </button>
      </div>
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div aria-busy="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="grid grid-cols-[180px_1fr_40px] gap-4 border-b border-gray-100 px-4 py-4">
          <div className="h-3 animate-pulse rounded bg-gray-100" />
          <div className="h-3 animate-pulse rounded bg-gray-100" />
          <div className="h-3 animate-pulse rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}
