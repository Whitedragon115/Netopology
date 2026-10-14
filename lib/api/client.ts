import createClient from 'openapi-fetch';
import type { paths } from './schema';
import { toClientText, toServerText } from './ids';
import type { Problem } from './types';

/**
 * Typed client for the Go API (contract: backend/api/contract.yaml, types generated into ./schema.d.ts).
 * Auth is a same-origin HttpOnly cookie, so the browser sends it automatically.
 */
export const api = createClient<paths>({ baseUrl: '/api/v1', credentials: 'same-origin' });

// translate client ids of optimistically created things (./ids.ts): requests get server ids, responses client ids
api.use({
  async onRequest({ request }) {
    const url = await toServerText(request.url);
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.body !== null;
    if (!hasBody) return url === request.url ? request : new Request(url, request);
    // Always rebuild a request with a body: once its body has been read through clone(), the original is
    // left with a streamed body, which hangs on the way through the proxy.
    const body = await toServerText(await request.text());
    return new Request(url, { method: request.method, headers: request.headers, body, credentials: request.credentials, signal: request.signal });
  },
  async onResponse({ response }) {
    if (!(response.headers.get('content-type') ?? '').includes('json')) return response;
    const text = await response.clone().text();
    const next = toClientText(text);
    if (next === text) return response;
    return new Response(next, { status: response.status, statusText: response.statusText, headers: response.headers });
  },
});

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem | undefined,
  ) {
    super(problem?.detail || problem?.title || `Request failed (${status})`);
  }
  get code() {
    return this.problem?.code;
  }
}

/** Unwrap an openapi-fetch result: return data or throw ApiError (for TanStack Query). */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.error !== undefined || !result.response.ok) {
    throw new ApiError(result.response.status, result.error as Problem | undefined);
  }
  return result.data as T;
}
