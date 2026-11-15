/**
 * A D1Database implementation backed by Node's built-in SQLite (node:sqlite), used to run the real
 * migrations, seed data and SQL queries in tests. Semantics mirrored from D1:
 *  - foreign keys enforced,
 *  - `bind()` returns a new statement (statements are reusable in batches),
 *  - `undefined` bind values are rejected,
 *  - `batch()` runs all statements in one transaction and rolls back on any error.
 */

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

type SqlValue = null | number | bigint | string | Uint8Array;

function normalize(value: unknown): SqlValue {
  if (value === undefined) throw new TypeError('D1_TYPE_ERROR: Type \'undefined\' not supported for value');
  if (value === null || typeof value === 'number' || typeof value === 'string' || typeof value === 'bigint') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Uint8Array) return value;
  throw new TypeError(`D1_TYPE_ERROR: Unsupported bind value type ${typeof value}`);
}

function plain<T>(row: unknown): T {
  return { ...(row as object) } as T;
}

class SqliteStatement implements D1PreparedStatement {
  readonly db: DatabaseSync;
  readonly sql: string;
  readonly params: SqlValue[];

  constructor(db: DatabaseSync, sql: string, params: SqlValue[] = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...values: unknown[]): D1PreparedStatement {
    return new SqliteStatement(this.db, this.sql, values.map(normalize));
  }

  execute<T>(): D1Result<T> {
    const rows = this.db.prepare(this.sql).all(...this.params).map((r) => plain<T>(r));
    const info = this.db.prepare('SELECT changes() AS changes, last_insert_rowid() AS id').get() as {
      changes: number;
      id: number;
    };
    return {
      results: rows,
      success: true,
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: rows.length,
        rows_written: info.changes,
        last_row_id: Number(info.id),
        changed_db: info.changes > 0,
        changes: info.changes,
      },
    };
  }

  first<T = unknown>(colName: string): Promise<T | null>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  async first<T>(colName?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (colName !== undefined) return (row[colName] ?? null) as T;
    return plain<T>(row);
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.execute<T>();
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.execute<T>();
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const rows = this.db.prepare(this.sql).all(...this.params) as Record<string, unknown>[];
    return rows.map((r) => Object.values(r) as T);
  }
}

export class SqliteD1 implements D1Database {
  readonly sqlite: DatabaseSync;

  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
  }

  prepare(query: string): D1PreparedStatement {
    return new SqliteStatement(this.sqlite, query);
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    this.sqlite.exec('BEGIN');
    try {
      const out = statements.map((s) => (s as SqliteStatement).execute<T>());
      this.sqlite.exec('COMMIT');
      return out;
    } catch (err) {
      this.sqlite.exec('ROLLBACK');
      throw err;
    }
  }

  async exec(query: string): Promise<{ count: number; duration: number }> {
    this.sqlite.exec(query);
    return { count: 0, duration: 0 };
  }

  execFile(path: string | URL): void {
    this.sqlite.exec(readFileSync(path, 'utf8'));
  }
}
