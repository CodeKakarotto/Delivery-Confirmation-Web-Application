import { useCallback, useEffect, useRef, useState } from 'react';

export interface ApiState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
  /** Replace the data with a fresher copy the caller already has (e.g. a mutation response). */
  mutate: (data: T) => void;
}

/** Loads data when `deps` change; ignores responses from superseded requests. */
export function useApi<T>(loader: () => Promise<T>, deps: unknown[]): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    loaderRef
      .current()
      .then((d) => {
        if (current) setData(d);
      })
      .catch((e: unknown) => {
        if (current) setError(e);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const mutate = useCallback((d: T) => {
    setData(d);
    setError(null);
  }, []);
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
