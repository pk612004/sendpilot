'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from './api';
import { Spinner } from '@/components/ui';

const Ctx = createContext(null);

/**
 * Loaded once for every /dashboard/* page: auth gate (401 -> login), user, server config
 * (limits are never hardcoded in the UI), senders, and live counts (polled).
 */
export function DashboardProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState(null);
  const [senders, setSenders] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace('/');
      });
    api
      .config()
      .then(setConfig)
      .catch(() => {});
  }, [router]);

  const reloadSenders = useCallback(async () => {
    try {
      setSenders(await api.senders());
    } catch {
      /* shown as empty list */
    }
  }, []);
  useEffect(() => {
    if (user) reloadSenders();
  }, [user, reloadSenders]);

  const refreshStats = useCallback(() => {
    api
      .stats()
      .then(setStats)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!user) return;
    refreshStats();
    const t = setInterval(() => document.visibilityState === 'visible' && refreshStats(), 4000);
    return () => clearInterval(t);
  }, [user, refreshStats]);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    router.replace('/');
  }, [router]);

  if (!user || !config) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }
  return (
    <Ctx.Provider value={{ user, config, senders, stats, reloadSenders, refreshStats, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDashboard() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDashboard must be used inside DashboardProvider');
  return c;
}
