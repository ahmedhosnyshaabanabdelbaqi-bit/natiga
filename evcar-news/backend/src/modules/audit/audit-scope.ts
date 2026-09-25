import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request audit annotations collected while an audited admin request
 * runs (AuditInterceptor opens the scope; services fill it through
 * AuditService.annotate()).
 */
export interface AuditScope {
  action?: string;
  entityType?: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

const storage = new AsyncLocalStorage<AuditScope>();

export const AuditScopeStore = {
  run<T>(scope: AuditScope, fn: () => T): T {
    return storage.run(scope, fn);
  },
  current(): AuditScope | undefined {
    return storage.getStore();
  },
};
