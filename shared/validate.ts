/**
 * Small, dependency-free schema validation with Zod-style ergonomics and full type inference.
 *
 * Why not Zod? The Worker ships with zero runtime dependencies (smaller bundle, faster cold
 * starts) and the whole API can be tested on Node's built-in test runner. The schemas live in
 * `shared/schemas.ts`; swapping them to Zod later is a mechanical change.
 */

export interface Issue {
  path: string;
  message: string;
}

export type ParseResult<T> = { success: true; data: T } | { success: false; issues: Issue[] };

const INVALID: unique symbol = Symbol('invalid');
type Invalid = typeof INVALID;
type Checker<T> = (input: unknown, path: string, issues: Issue[]) => T | Invalid;

export interface Schema<T> {
  readonly check: Checker<T>;
  optional(): Schema<T | undefined>;
  nullable(): Schema<T | null>;
  refine(predicate: (value: T) => boolean, message: string): Schema<T>;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

function make<T>(check: Checker<T>): Schema<T> {
  return {
    check,
    optional: () => make<T | undefined>((v, p, i) => (v === undefined ? undefined : check(v, p, i))),
    nullable: () => make<T | null>((v, p, i) => (v === null ? null : check(v, p, i))),
    refine: (predicate, message) =>
      make<T>((v, p, i) => {
        const out = check(v, p, i);
        if (out === INVALID) return INVALID;
        if (!predicate(out)) {
          i.push({ path: p, message });
          return INVALID;
        }
        return out;
      }),
  };
}

function fail(issues: Issue[], path: string, message: string): Invalid {
  issues.push({ path, message });
  return INVALID;
}

// Control characters other than tab/newline/carriage return are never accepted.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const LINE_BREAKS = /[\r\n\t]/;

export interface StringOptions {
  min?: number;
  max?: number;
  /** Trim surrounding whitespace before validating (default true). */
  trim?: boolean;
  /** Allow line breaks and tabs (default false). */
  multiline?: boolean;
  pattern?: RegExp;
  patternMessage?: string;
  transform?: (value: string) => string;
}

function string(opts: StringOptions = {}): Schema<string> {
  return make<string>((v, p, i) => {
    if (v === undefined || v === null) return fail(i, p, 'Required');
    if (typeof v !== 'string') return fail(i, p, 'Expected text');
    let s = opts.trim === false ? v : v.trim();
    if (CONTROL_CHARS.test(s)) return fail(i, p, 'Contains unsupported control characters');
    if (!opts.multiline && LINE_BREAKS.test(s)) return fail(i, p, 'Must be a single line');
    if (opts.min !== undefined && s.length < opts.min) {
      return fail(i, p, opts.min <= 1 ? 'Required' : `Must be at least ${opts.min} characters`);
    }
    if (opts.max !== undefined && s.length > opts.max) {
      return fail(i, p, `Must be at most ${opts.max} characters`);
    }
    if (opts.pattern && !opts.pattern.test(s)) return fail(i, p, opts.patternMessage ?? 'Invalid format');
    if (opts.transform) s = opts.transform(s);
    return s;
  });
}

function number(opts: { min?: number; max?: number; integer?: boolean } = {}): Schema<number> {
  return make<number>((v, p, i) => {
    if (v === undefined || v === null) return fail(i, p, 'Required');
    if (typeof v !== 'number' || !Number.isFinite(v)) return fail(i, p, 'Expected a number');
    if (opts.integer && !Number.isInteger(v)) return fail(i, p, 'Expected a whole number');
    if (opts.min !== undefined && v < opts.min) return fail(i, p, `Must be at least ${opts.min}`);
    if (opts.max !== undefined && v > opts.max) return fail(i, p, `Must be at most ${opts.max}`);
    return v;
  });
}

function int(opts: { min?: number; max?: number } = {}): Schema<number> {
  return number({ ...opts, integer: true });
}

/** Positive database id (1 .. 2^31-1). */
function id(): Schema<number> {
  return int({ min: 1, max: 2_147_483_647 });
}

function boolean(): Schema<boolean> {
  return make<boolean>((v, p, i) => {
    if (v === undefined || v === null) return fail(i, p, 'Required');
    if (typeof v !== 'boolean') return fail(i, p, 'Expected true or false');
    return v;
  });
}

function enumOf<const T extends readonly string[]>(values: T): Schema<T[number]> {
  return make<T[number]>((v, p, i) => {
    if (v === undefined || v === null) return fail(i, p, 'Required');
    if (typeof v !== 'string' || !values.includes(v)) {
      return fail(i, p, `Must be one of: ${values.join(', ')}`);
    }
    return v as T[number];
  });
}

function literal<const T extends string | number | boolean>(value: T): Schema<T> {
  return make<T>((v, p, i) => (v === value ? value : fail(i, p, `Must be ${String(value)}`)));
}

function array<T>(
  item: Schema<T>,
  opts: { min?: number; max?: number; unique?: boolean; uniqueMessage?: string } = {},
): Schema<T[]> {
  return make<T[]>((v, p, i) => {
    if (v === undefined || v === null) return fail(i, p, 'Required');
    if (!Array.isArray(v)) return fail(i, p, 'Expected a list');
    if (opts.min !== undefined && v.length < opts.min) {
      return fail(i, p, opts.min === 1 ? 'Select at least one item' : `Needs at least ${opts.min} items`);
    }
    if (opts.max !== undefined && v.length > opts.max) return fail(i, p, `At most ${opts.max} items allowed`);
    const out: T[] = [];
    let ok = true;
    v.forEach((el, idx) => {
      const r = item.check(el, `${p}[${idx}]`, i);
      if (r === INVALID) ok = false;
      else out.push(r);
    });
    if (!ok) return INVALID;
    if (opts.unique) {
      const seen = new Set<string>();
      for (const el of out) {
        const key = JSON.stringify(el);
        if (seen.has(key)) return fail(i, p, opts.uniqueMessage ?? 'Contains duplicates');
        seen.add(key);
      }
    }
    return out;
  });
}

type AnyShape = Record<string, Schema<unknown>>;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
type OptionalKeys<S extends AnyShape> = {
  [K in keyof S]: undefined extends Infer<S[K]> ? K : never;
}[keyof S];
type RequiredKeys<S extends AnyShape> = Exclude<keyof S, OptionalKeys<S>>;
export type ObjectOutput<S extends AnyShape> = Simplify<
  { [K in RequiredKeys<S>]: Infer<S[K]> } & { [K in OptionalKeys<S>]?: Infer<S[K]> }
>;

function object<S extends AnyShape>(shape: S, opts: { strict?: boolean } = {}): Schema<ObjectOutput<S>> {
  const strict = opts.strict ?? true;
  return make<ObjectOutput<S>>((v, p, i) => {
    if (v === undefined || v === null) return fail(i, p, 'Required');
    if (typeof v !== 'object' || Array.isArray(v)) return fail(i, p, 'Expected an object');
    const input = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    let ok = true;
    for (const key of Object.keys(shape)) {
      const childPath = p ? `${p}.${key}` : key;
      const value = Object.prototype.hasOwnProperty.call(input, key) ? input[key] : undefined;
      const r = shape[key]!.check(value, childPath, i);
      if (r === INVALID) ok = false;
      else if (r !== undefined) out[key] = r;
    }
    if (strict) {
      for (const key of Object.keys(input)) {
        if (!Object.prototype.hasOwnProperty.call(shape, key)) {
          i.push({ path: p ? `${p}.${key}` : key, message: 'Unknown field' });
          ok = false;
        }
      }
    }
    return ok ? (out as ObjectOutput<S>) : INVALID;
  });
}

export const s = { string, number, int, id, boolean, enumOf, literal, array, object };

export function parse<T>(schema: Schema<T>, input: unknown): ParseResult<T> {
  const issues: Issue[] = [];
  const out = schema.check(input, '', issues);
  if (out === INVALID || issues.length > 0) {
    return { success: false, issues: issues.length ? issues : [{ path: '', message: 'Invalid input' }] };
  }
  return { success: true, data: out };
}
