'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Fetch + auto-refresh (the tables feel live while the worker sends).
 * Pauses when the tab is hidden, ignores out-of-order responses, keeps the
 * last good data when a refresh fails (no flicker to an empty table).
 */
export function usePolling(fetcher, deps, intervalMs = 5000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const reqId = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async (showLoading) => {
    const id = ++reqId.current;
    if (showLoading) setLoading(true);
    try {
      const d = await fetcher();
      if (id === reqId.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, deps);

  useEffect(() => {
    setData(null);
    run(true);
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') run(false);
    }, intervalMs);
    return () => clearInterval(t);
  }, [run, intervalMs]);

  return { data, loading, error, refresh: () => run(false) };
}
