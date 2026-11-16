import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ConfirmationSubmit, DriverDelivery } from '../../../shared/types.ts';
import { localDateKey } from '../../../shared/shopTime.ts';
import { driverApi } from '../api/endpoints.ts';
import { useAuth } from './auth.tsx';
import { IndexedDbStore } from './offlineStore.ts';
import { Outbox, TodayCache, type OutboxItem } from './outbox.ts';
import { useShopTimeZone } from './useShopConfig.ts';

/**
 * Offline support for drivers: confirmations saved while there is no signal (or the server had a problem) wait in the
 * outbox on the phone and are sent automatically when possible; today's delivery details are kept on the phone so an
 * order can be opened without signal. Only active for driver accounts.
 */
interface OfflineValue {
  /** Confirmations waiting to be sent, and ones the server refused (state 'failed'). */
  items: OutboxItem[];
  syncing: boolean;
  /** Increases each time something was sent, so screens can reload. */
  sentVersion: number;
  queue: (payload: ConfirmationSubmit) => Promise<void>;
  syncNow: () => Promise<void>;
  discard: (key: string) => Promise<void>;
  saveToday: (items: DriverDelivery[]) => Promise<void>;
  listToday: () => Promise<DriverDelivery[]>;
  findToday: (orderId: string) => Promise<DriverDelivery | null>;
  forgetToday: (orderId: string) => Promise<void>;
}

const noop = async () => {};
const OfflineContext = createContext<OfflineValue>({
  items: [],
  syncing: false,
  sentVersion: 0,
  queue: noop,
  syncNow: noop,
  discard: noop,
  saveToday: noop,
  listToday: async () => [],
  findToday: async () => null,
  forgetToday: noop,
});

const store = new IndexedDbStore();
const outbox = new Outbox(store);
const today = new TodayCache(store);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const timeZone = useShopTimeZone();
  const username = user?.role === 'driver' ? user.username : null;
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [sentVersion, setSentVersion] = useState(0);
  const usernameRef = useRef(username);
  usernameRef.current = username;

  const refresh = useCallback(async () => {
    setItems(usernameRef.current ? await outbox.list(usernameRef.current) : []);
  }, []);

  const syncNow = useCallback(async () => {
    const name = usernameRef.current;
    if (!name) return;
    setSyncing(true);
    try {
      const result = await outbox.sync(name, (p) => driverApi.submit(p));
      if (result.sent > 0) setSentVersion((v) => v + 1);
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [refresh]);

  // Send whenever it may work: on sign-in, when the phone comes back online or back to the app, and every 20 s while
  // something is waiting.
  useEffect(() => {
    void refresh().then(syncNow);
    if (!username) return;
    const onOnline = () => void syncNow();
    const onVisible = () => document.visibilityState === 'visible' && void syncNow();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [username, refresh, syncNow]);

  const waiting = items.some((i) => i.state === 'waiting');
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => void syncNow(), 20_000);
    return () => window.clearInterval(timer);
  }, [waiting, syncNow]);

  const value = useMemo<OfflineValue>(() => {
    const day = () => localDateKey(new Date(), timeZone);
    return {
      items,
      syncing,
      sentVersion,
      queue: async (payload) => {
        if (!usernameRef.current) return;
        await outbox.add(usernameRef.current, payload);
        await today.forget(usernameRef.current, payload.orderId);
        await refresh();
      },
      syncNow,
      discard: async (key) => {
        await outbox.remove(key);
        await refresh();
      },
      saveToday: async (list) => {
        if (usernameRef.current) await today.save(usernameRef.current, day(), list);
      },
      listToday: async () => (usernameRef.current ? today.list(usernameRef.current, day()) : []),
      findToday: async (orderId) => (usernameRef.current ? today.find(usernameRef.current, orderId, day()) : null),
      forgetToday: async (orderId) => {
        if (usernameRef.current) await today.forget(usernameRef.current, orderId);
      },
    };
  }, [items, syncing, sentVersion, syncNow, refresh, timeZone]);

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineValue {
  return useContext(OfflineContext);
}

/** The outbox banner for drivers: how many are waiting, and the ones that need attention. */
export function OutboxBanner() {
  const { items, syncing, syncNow, discard } = useOffline();
  const waiting = items.filter((i) => i.state === 'waiting');
  const failed = items.filter((i) => i.state === 'failed');
  if (items.length === 0) return null;
  return (
    <div className="outbox no-print" role="status" aria-live="polite">
      {waiting.length > 0 && (
        <div className="outbox-row outbox-waiting">
          <span className="outbox-icon" aria-hidden="true">
            ⇪
          </span>
          <span className="outbox-text">
            <strong>
              {waiting.length === 1 ? '1 confirmation is' : `${waiting.length} confirmations are`} saved on this phone.
            </strong>{' '}
            {syncing ? 'Sending now…' : 'It will send automatically when there is signal.'}
          </span>
          <button type="button" className="btn btn-small" onClick={() => void syncNow()} disabled={syncing}>
            Send now
          </button>
        </div>
      )}
      {failed.map((item) => (
        <div key={item.key} className="outbox-row outbox-failed">
          <span className="outbox-icon" aria-hidden="true">
            !
          </span>
          <span className="outbox-text">
            <strong>Order {item.payload.orderId} could not be saved.</strong> {item.message} Call the shop, then remove it from this phone.
          </span>
          <button
            type="button"
            className="btn btn-small btn-ghost-danger"
            onClick={() => {
              if (window.confirm(`Remove order ${item.payload.orderId} from this phone? Make sure the shop knows first.`)) void discard(item.key);
            }}
          >
            Remove from phone
          </button>
        </div>
      ))}
    </div>
  );
}
