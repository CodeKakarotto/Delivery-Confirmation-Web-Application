import type { SessionUser } from './auth.ts';
import type { Env, Settings } from './env.ts';

export interface RequestContext {
  request: Request;
  env: Env;
  db: D1Database;
  settings: Settings;
  url: URL;
  params: Record<string, string>;
  requestId: string;
  now: Date;
  /** Response headers handlers want added. */
  responseHeaders: Headers;
  /** The signed-in account, once requireUser has run. */
  user: SessionUser | null;
}

export type Handler = (ctx: RequestContext) => Promise<Response>;

interface RouteDef {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

export type MatchResult =
  | { kind: 'match'; handler: Handler; params: Record<string, string> }
  | { kind: 'method_not_allowed'; allowed: string[] }
  | { kind: 'not_found' };

/** Minimal path router: supports static segments and `:param` segments. */
export class Router {
  private routes: RouteDef[] = [];

  add(method: string, path: string, handler: Handler): this {
    const keys: string[] = [];
    const source = path
      .split('/')
      .map((part) => {
        if (part.startsWith(':')) {
          keys.push(part.slice(1));
          return '([^/]+)';
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    this.routes.push({ method, pattern: new RegExp(`^${source}/?$`), keys, handler });
    return this;
  }

  match(method: string, pathname: string): MatchResult {
    const allowed: string[] = [];
    for (const r of this.routes) {
      const m = r.pattern.exec(pathname);
      if (!m) continue;
      if (r.method !== method) {
        allowed.push(r.method);
        continue;
      }
      const params: Record<string, string> = {};
      try {
        r.keys.forEach((k, i) => {
          params[k] = decodeURIComponent(m[i + 1]!);
        });
      } catch {
        return { kind: 'not_found' };
      }
      return { kind: 'match', handler: r.handler, params };
    }
    return allowed.length ? { kind: 'method_not_allowed', allowed } : { kind: 'not_found' };
  }
}
