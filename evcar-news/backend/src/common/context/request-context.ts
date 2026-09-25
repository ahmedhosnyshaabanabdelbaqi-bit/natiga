import { AsyncLocalStorage } from 'node:async_hooks';
import type { SupportedLanguage } from '../../config/app-config';

/**
 * Per-request context available anywhere (services, audit, logging) without
 * passing the request object around. Populated by RequestContextMiddleware;
 * auth guards set `userId` / `userLabel` once the caller is authenticated.
 */
export interface RequestContextData {
  requestId: string;
  ip?: string;
  userAgent?: string;
  lang: SupportedLanguage;
  market: string;
  userId?: string;
  userLabel?: string;
}

const storage = new AsyncLocalStorage<RequestContextData>();

export const RequestContext = {
  run<T>(data: RequestContextData, fn: () => T): T {
    return storage.run(data, fn);
  },
  get(): RequestContextData | undefined {
    return storage.getStore();
  },
  /** Mutates the current context (e.g. after authentication). No-op outside a request. */
  set(patch: Partial<RequestContextData>): void {
    const current = storage.getStore();
    if (current) Object.assign(current, patch);
  },
  requestId(): string | undefined {
    return storage.getStore()?.requestId;
  },
};
