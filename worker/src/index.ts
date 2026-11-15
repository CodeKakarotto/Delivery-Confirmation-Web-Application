/** Cloudflare Worker entry point. The API itself lives in app.ts. */
import { handleRequest } from './app.ts';
import type { Env } from './env.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
