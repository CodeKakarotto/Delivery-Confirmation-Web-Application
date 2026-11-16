import { useCallback, useEffect, useRef, useState } from 'react';

export interface ApiState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
  /** Replace the data with a fresher copy the caller already has (e.g. a mutation response). */
  mutate: (data: T) => void;
}

/** How often live pages fetch fresh numbers in the background. */
export const LIVE_REFRESH_MS = 30_000;

const DATA_CHANGED = 'mf:data-changed';

/** Tell every live list and calendar on this page to refresh now (after a confirmation, correction, void, …). */
export function announceDataChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DATA_CHANGED));
}

/**
 * Loads data when `deps` change; ignores responses from superseded requests.
 * With `live`, it also refreshes quietly (no spinner, the old data stays on screen, a failed refresh is ignored)
 * every 30 seconds while the page is visible, as soon as the window comes back into view, and right after this
 * phone or computer saves a change. So a delivery a driver confirms shows up on the employees' calendars and lists
 * without anyone reloading the page.
 */
export function useApi<T>(loader: () => Promise<T>, deps: unknown[], opts: { live?: boolean } = {}): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const silentRef = useRef(false);

  useEffect(() => {
    let current = true;
    const silent = silentRef.current;
    silentRef.current = false;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    loaderRef
      .current()
      .then((d) => {
        if (!current) return;
        setData(d);
        if (silent) setError(null);
      })
      .catch((e: unknown) => {
        if (current && !silent) setError(e);
      })
      .finally(() => {
        if (current && !silent) setLoading(false);
      });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const refresh = useCallback(() => {
    silentRef.current = true;
    setTick((t) => t + 1);
  }, []);
  const mutate = useCallback((d: T) => {
    setData(d);
    setError(null);
  }, []);

  const live = Boolean(opts.live);
  useEffect(() => {
    if (!live || typeof window === 'undefined') return;
    const visible = () => document.visibilityState === 'visible';
    const id = window.setInterval(() => {
      if (visible()) refresh();
    }, LIVE_REFRESH_MS);
    const onBack = () => {
      if (visible()) refresh();
    };
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener(DATA_CHANGED, onBack);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onBack);
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener(DATA_CHANGED, onBack);
    };
  }, [live, refresh]);

  return { data, error, loading, reload, mutate };
}

/** Debounces a fast-changing value (e.g. a search box). */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
