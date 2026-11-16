/**
 * Small key-value storage for what the driver's phone keeps while there is no signal: confirmations waiting to be sent
 * and today's delivery details. Backed by IndexedDB in the browser (it survives closing the page), and by memory in
 * tests. Everything here is deleted when it is no longer needed and when the driver signs out (the server's
 * Clear-Site-Data wipes it).
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

export class MemoryStore implements KeyValueStore {
  private data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, structuredClone(value));
  }
  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
  async keys(prefix: string): Promise<string[]> {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
}

const DB_NAME = 'mf-delivery-offline';
const STORE = 'kv';

/** IndexedDB store; falls back to memory when IndexedDB is unavailable (private mode, old browsers). */
export class IndexedDbStore implements KeyValueStore {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private fallback = new MemoryStore();

  private open(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private async run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  }

  private usable(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (!this.usable()) return this.fallback.get<T>(key);
    try {
      return await this.run<T | undefined>('readonly', (s) => s.get(key));
    } catch {
      return this.fallback.get<T>(key);
    }
  }
  async set<T>(key: string, value: T): Promise<void> {
    if (!this.usable()) return this.fallback.set(key, value);
    try {
      await this.run('readwrite', (s) => s.put(value, key));
    } catch {
      await this.fallback.set(key, value);
    }
  }
  async delete(key: string): Promise<void> {
    if (!this.usable()) return this.fallback.delete(key);
    try {
      await this.run('readwrite', (s) => s.delete(key));
    } catch {
      await this.fallback.delete(key);
    }
  }
  async keys(prefix: string): Promise<string[]> {
    if (!this.usable()) return this.fallback.keys(prefix);
    try {
      const all = await this.run<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
      return all.map(String).filter((k) => k.startsWith(prefix)).sort();
    } catch {
      return this.fallback.keys(prefix);
    }
  }
}
