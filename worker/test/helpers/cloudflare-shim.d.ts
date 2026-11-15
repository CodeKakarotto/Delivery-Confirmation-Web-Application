/**
 * Type declarations for the subset of the Cloudflare D1 API used by the Worker, so the Worker
 * source can be type-checked together with the Node-based tests (which cannot load
 * @cloudflare/workers-types alongside @types/node without global conflicts).
 * Shapes follow @cloudflare/workers-types.
 */

declare global {
  interface D1Meta {
    duration: number;
    size_after: number;
    rows_read: number;
    rows_written: number;
    last_row_id: number;
    changed_db: boolean;
    changes: number;
  }

  interface D1Result<T = Record<string, unknown>> {
    results: T[];
    success: true;
    meta: D1Meta & Record<string, unknown>;
  }

  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = unknown>(colName: string): Promise<T | null>;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    raw<T = unknown[]>(): Promise<T[]>;
  }

  interface D1Database {
    prepare(query: string): D1PreparedStatement;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
    exec(query: string): Promise<{ count: number; duration: number }>;
  }
}

export {};
