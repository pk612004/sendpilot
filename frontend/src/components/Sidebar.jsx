'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useDashboard } from '@/lib/dashboard-context';
import { Avatar, Popover } from './ui';
import { ChevronDownIcon, ClockIcon, ExternalIcon, LogoutIcon, QueueIcon, SendIcon } from './icons';
import { SlackConnect } from './SlackConnect';

/** Left column: logo, user card, Compose, CORE nav. */
export function Sidebar({ tab, onTab }) {
  const { user, stats, logout } = useDashboard();
  const [menu, setMenu] = useState(false);
  const counts = {
    scheduled: stats ? stats.scheduled + stats.sending : 0,
    sent: stats ? stats.sent + stats.failed + stats.uncertain : 0,
  };

  const NavItem = ({ t, label, icon }) => (
    <button
      onClick={() => onTab(t)}
      aria-current={tab === t ? 'page' : undefined}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${tab === t ? 'bg-brand-50 font-medium text-gray-900' : 'text-gray-700 hover:bg-gray-50'}`}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      <span className="text-xs text-gray-500">{counts[t].toLocaleString()}</span>
    </button>
  );

  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col px-3 py-4">
      <div className="mb-4 px-2 font-pixel text-[22px] leading-none tracking-tight text-gray-900">
        SendPilot
      </div>

      {/* user card + menu */}
      <div className="relative mb-3">
        <button
          onClick={() => setMenu((m) => !m)}
          className="flex w-full items-center gap-2 rounded-xl bg-gray-50 px-2 py-2 text-left hover:bg-gray-100"
        >
          <Avatar src={user.avatar_url} name={user.name} size={30} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium leading-tight text-gray-900">{user.name}</div>
            <div className="truncate text-[11px] leading-tight text-gray-500">{user.email}</div>
          </div>
          <ChevronDownIcon size={14} className="text-gray-400" />
        </button>
        <Popover open={menu} onClose={() => setMenu(false)} className="left-0 right-0 top-14 p-1">
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <LogoutIcon size={15} /> Logout
          </button>
        </Popover>
      </div>

      <Link
        href="/dashboard/compose"
        className="mb-5 block rounded-full border border-brand-600 py-1.5 text-center text-sm font-medium text-brand-700 hover:bg-brand-50"
      >
        Compose
      </Link>

      <div className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wide text-gray-400">Core</div>
      <nav className="space-y-0.5">
        <NavItem t="scheduled" label="Scheduled" icon={<ClockIcon size={15} />} />
        <NavItem t="sent" label="Sent" icon={<SendIcon size={15} />} />
      </nav>

      {/* Integrations: Slack alerts and the live job queue */}
      <div className="mt-auto space-y-0.5 border-t border-gray-100 pt-3">
        <div className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wide text-gray-400">
          Integrations
        </div>
        <SlackConnect />
        <a
          href="/admin/queues"
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <QueueIcon size={15} /> <span className="flex-1">Queue dashboard</span>{' '}
          <ExternalIcon size={13} className="text-gray-400" />
        </a>
      </div>
    </aside>
  );
}
