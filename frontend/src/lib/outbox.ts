import type { ConfirmationSubmit, DriverDelivery } from '../../../shared/types.ts';
import { ApiRequestError } from '../api/client.ts';
import type { KeyValueStore } from './offlineStore.ts';

/**
 * The driver's outbox: confirmations that could not reach the server yet (no signal, or the server had a problem).
 * They are kept on the phone and sent automatically later. Each keeps its request key, so sending it again can never
 * create a second confirmation. A confirmation the server refuses is never thrown away silently: it is kept and marked
 * "needs attention" until the driver removes it.
 */

export type SendAction = 'sent' | 'retry' | 'signin' | 'failed';

/** What a failed send means for the outbox. */
export function classifySendError(err: unknown): Exclude<SendAction, 'sent'> {
  if (!(err instanceof ApiRequestError)) return 'retry'; // e.g. the browser could not reach the network
  if (err.status === 0 || err.status >= 500 || err.status === 429) return 'retry';
  if (err.status === 401) return 'signin';
  return 'failed';
}

export interface OutboxItem {
  key: string;
  username: string;
  payload: ConfirmationSubmit;
  savedAt: string;
  state: 'waiting' | 'failed';
  tries: number;
  /** Why the server refused it (state 'failed'). */
  message?: string;
}

export interface SyncResult {
  sent: number;
  waiting: number;
  failed: number;
  needsSignIn: boolean;
}

const PREFIX = 'outbox:';

export class Outbox {
  private store: KeyValueStore;
  private running: Promise<SyncResult> | null = null;

  constructor(store: KeyValueStore) {
    this.store = store;
  }

  async add(username: string, payload: ConfirmationSubmit): Promise<void> {
    // Keys sort by save time, so items are sent in the order they were saved.
    const existing = (await this.list(username)).find((i) => i.payload.idempotencyKey === payload.idempotencyKey);
    if (existing) return;
    const savedAt = new Date().toISOString();
    const item: OutboxItem = { key: `${PREFIX}${savedAt}:${payload.idempotencyKey}`, username, payload, savedAt, state: 'waiting', tries: 0 };
    await this.store.set(item.key, item);
  }

  async list(username: string): Promise<OutboxItem[]> {
    const items: OutboxItem[] = [];
    for (const key of await this.store.keys(PREFIX)) {
      const item = await this.store.get<OutboxItem>(key);
      if (item && item.username === username) items.push(item);
    }
    return items;
  }

  async remove(key: string): Promise<void> {
    await this.store.delete(key);
  }

  /** Sends every waiting item for this driver, oldest first. Only one sync runs at a time. */
  sync(username: string, send: (p: ConfirmationSubmit) => Promise<unknown>): Promise<SyncResult> {
    this.running ??= this.doSync(username, send).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async doSync(username: string, send: (p: ConfirmationSubmit) => Promise<unknown>): Promise<SyncResult> {
    const result: SyncResult = { sent: 0, waiting: 0, failed: 0, needsSignIn: false };
    for (const item of await this.list(username)) {
      if (item.state === 'failed') {
        result.failed++;
        continue;
      }
      if (result.needsSignIn) {
        result.waiting++;
        continue;
      }
      try {
        await send(item.payload);
        await this.store.delete(item.key);
        result.sent++;
      } catch (err) {
        const action = classifySendError(err);
        if (action === 'failed') {
          await this.store.set(item.key, { ...item, state: 'failed', tries: item.tries + 1, message: err instanceof Error ? err.message : 'Not accepted' });
          result.failed++;
        } else {
          await this.store.set(item.key, { ...item, tries: item.tries + 1 });
          result.waiting++;
          if (action === 'signin') result.needsSignIn = true;
        }
      }
    }
    return result;
  }
}

/** Today's delivery details kept on the phone, so an order can be opened where there is no signal. */
export class TodayCache {
  private store: KeyValueStore;
  constructor(store: KeyValueStore) {
    this.store = store;
  }

  private key(username: string): string {
    return `today:${username}`;
  }

  async save(username: string, date: string, items: DriverDelivery[]): Promise<void> {
    await this.store.set(this.key(username), { date, items });
  }

  async list(username: string, today: string): Promise<DriverDelivery[]> {
    const saved = await this.store.get<{ date: string; items: DriverDelivery[] }>(this.key(username));
    if (!saved) return [];
    if (saved.date !== today) {
      await this.store.delete(this.key(username)); // yesterday's copy is deleted, not used
      return [];
    }
    return saved.items;
  }

  async find(username: string, orderId: string, today: string): Promise<DriverDelivery | null> {
    const lower = orderId.toLowerCase();
    return (await this.list(username, today)).find((d) => d.orderId.toLowerCase() === lower) ?? null;
  }

  async forget(username: string, orderId: string): Promise<void> {
    const saved = await this.store.get<{ date: string; items: DriverDelivery[] }>(this.key(username));
    if (!saved) return;
    const lower = orderId.toLowerCase();
    await this.store.set(this.key(username), { ...saved, items: saved.items.filter((d) => d.orderId.toLowerCase() !== lower) });
  }
}
