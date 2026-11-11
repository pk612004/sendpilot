'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useDashboard } from '@/lib/dashboard-context';
import { usePolling } from '@/hooks/usePolling';
import { Sidebar } from '@/components/Sidebar';
import { EmailListRow, ListSkeleton, useStars } from '@/components/EmailList';
import { Button, EmptyState, IconButton, Popover, Spinner } from '@/components/ui';
import { ClockIcon, FilterIcon, RefreshIcon, SearchIcon, SendIcon } from '@/components/icons';
import { useToast } from '@/components/ui/Toast';

const PAGE_SIZE = 25;
const FILTERS = {
  scheduled: [
    { value: undefined, label: 'All' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'sending', label: 'Sending' },
  ],
  sent: [
    { value: undefined, label: 'All' },
    { value: 'sent', label: 'Sent' },
    { value: 'failed', label: 'Failed' },
    { value: 'uncertain', label: 'Uncertain' },
  ],
};

function Inbox() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { refreshStats } = useDashboard();
  const tab = params.get('tab') === 'sent' ? 'sent' : 'scheduled';
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(undefined);
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState(null);
  const [searching, setSearching] = useState(false);
  const { stars, toggle } = useStars();

  const setTab = (t) => {
    setPage(1);
    setStatus(undefined);
    router.replace(`/dashboard?tab=${t}`);
  };

  // Results of Slack OAuth (?slack=...) and of scheduling (?scheduled=N) come back via the URL.
  // Ref guard: React strict mode runs effects twice in development.
  const handled = useRef('');
  useEffect(() => {
    const slack = params.get('slack');
    const key = `${slack}`;
    if (!slack || handled.current === key) return;
    handled.current = key;
    if (slack === 'connected') toast('success', 'Slack connected. Rate-limit alerts will be posted there.');
    else if (slack === 'cancelled') toast('info', 'Slack connection cancelled');
    else toast('error', 'Slack connection failed');
    router.replace(`/dashboard?tab=${tab}`);
  }, [params, router, toast, tab]);

  const emails = usePolling(() => api.emails(tab, page, PAGE_SIZE, status), [tab, page, status], 4000);

  // Debounced Elasticsearch search
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearch(null);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      api
        .search(q, tab)
        .then(setSearch)
        .catch((e) => toast('error', e.message))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, tab, toast]);

  const refresh = () => {
    emails.refresh();
    refreshStats();
  };
  const open = (id) => router.push(`/dashboard/email/${id}?from=${tab}`);
  const total = emails.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = emails.data?.items ?? [];

  return (
    <div className="flex h-screen bg-white">
      <Sidebar tab={tab} onTab={setTab} />

      <main className="flex min-w-0 flex-1 flex-col px-4 py-4">
        {/* search bar + filter + refresh */}
        <div className="mb-2 flex items-center gap-3">
          <div className="relative w-full max-w-[460px]">
            <SearchIcon size={15} className="pointer-events-none absolute left-3.5 top-2.5 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search emails"
              className="w-full rounded-full bg-field py-2 pl-9 pr-9 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            {searching && <Spinner className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />}
          </div>
          <div className="relative">
            <IconButton
              label="Filter by status"
              onClick={() => setFilterOpen((o) => !o)}
              className={status ? 'text-brand-700' : ''}
            >
              <FilterIcon size={15} />
            </IconButton>
            <Popover
              open={filterOpen}
              onClose={() => setFilterOpen(false)}
              className="left-0 top-10 w-40 p-1"
            >
              {FILTERS[tab].map((f) => (
                <button
                  key={f.label}
                  onClick={() => {
                    setStatus(f.value);
                    setPage(1);
                    setFilterOpen(false);
                  }}
                  className={`block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${status === f.value ? 'font-medium text-brand-700' : 'text-gray-700'}`}
                >
                  {f.label}
                </button>
              ))}
            </Popover>
          </div>
          <IconButton label="Refresh" onClick={refresh}>
            <RefreshIcon size={15} />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {search ? (
            <>
              <div className="flex justify-between px-4 py-2 text-xs text-gray-500">
                <span>
                  {search.hits.length} result(s) for “{query}”
                </span>
                <span>
                  {search.source === 'elasticsearch'
                    ? 'via Elasticsearch'
                    : 'Elasticsearch unavailable: MySQL fallback'}
                </span>
              </div>
              {search.hits.length === 0 ? (
                <p className="py-16 text-center text-sm text-gray-500">No matches.</p>
              ) : (
                search.hits.map((h) => (
                  <EmailListRow
                    key={h.id}
                    item={h}
                    starred={stars.has(h.id)}
                    onStar={() => toggle(h.id)}
                    onOpen={() => open(h.id)}
                  />
                ))
              )}
            </>
          ) : emails.error && items.length === 0 ? (
            <EmptyState
              icon="!"
              title="Couldn't load emails"
              description={emails.error}
              action={
                <Button variant="outline" pill onClick={refresh}>
                  Try again
                </Button>
              }
            />
          ) : emails.loading && items.length === 0 ? (
            <ListSkeleton />
          ) : items.length === 0 ? (
            tab === 'scheduled' ? (
              <EmptyState
                icon={<ClockIcon size={20} />}
                title={status ? 'Nothing with this status' : 'No scheduled emails'}
                description="Compose an email and upload your leads. Scheduled emails stay here until they're sent."
                action={
                  <Link href="/dashboard/compose">
                    <Button variant="outline" pill>
                      Compose
                    </Button>
                  </Link>
                }
              />
            ) : (
              <EmptyState
                icon={<SendIcon size={20} />}
                title={status ? 'Nothing with this status' : 'No sent emails yet'}
                description="Sent emails appear here, each with a link to view it in Ethereal."
              />
            )
          ) : (
            items.map((e) => (
              <EmailListRow
                key={e.id}
                item={e}
                starred={stars.has(e.id)}
                onStar={() => toggle(e.id)}
                onOpen={() => open(e.id)}
              />
            ))
          )}
        </div>

        {!search && total > PAGE_SIZE && (
          <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-4 pt-3 text-xs text-gray-500">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}
            </span>
            <button
              className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ‹ Prev
            </button>
            <button
              className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next ›
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Inbox />
    </Suspense>
  );
}
