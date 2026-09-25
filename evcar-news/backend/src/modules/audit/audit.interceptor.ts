import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { mergeMap, Observable } from 'rxjs';
import { toAuditJson } from './audit-redact';
import { AuditScopeStore, type AuditScope } from './audit-scope';
import { AUDIT_OPTIONS_KEY, SKIP_AUDIT_KEY, type AuditOptions } from './audit.decorators';
import { routePathOf } from '../auth/guards/jwt-auth.guard';
import { AuditService } from './audit.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ADMIN_PREFIX = '/api/v1/admin/';
const VERB: Record<string, string> = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

/**
 * Derives action/entity names from the route pattern:
 *   PUT /api/v1/admin/users/:id/roles → { action: "users.roles.update", entityType: "users" }
 */
export function deriveAuditNames(
  method: string,
  routePath: string,
): { action: string; entityType: string } {
  const lower = routePath.toLowerCase();
  const rel = lower.startsWith(ADMIN_PREFIX)
    ? lower.slice(ADMIN_PREFIX.length)
    : lower.replace(/^\/+/, '');
  const segments = rel.split('/').filter((s) => s && !s.startsWith(':') && !s.startsWith('*'));
  const base = segments.length > 0 ? segments.join('.') : 'admin';
  return {
    action: `${base}.${VERB[method] ?? method.toLowerCase()}`.slice(0, 100),
    entityType: (segments[0] ?? 'admin').slice(0, 64),
  };
}

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0;
}

/** `{ data: {...} }` response → the entity; anything else → undefined. */
function responseEntity(result: unknown): Record<string, unknown> | undefined {
  const data = (result as { data?: unknown } | undefined)?.data;
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : undefined;
}

/**
 * Global interceptor (APP_INTERCEPTOR): after every SUCCESSFUL
 * POST/PUT/PATCH/DELETE under /api/v1/admin writes one audit_logs row with
 * actor, action, entity type/id, before/after (+ diff), ip, user agent and
 * request id. Handlers/services refine it with AuditService.annotate() or
 * @Audit(); @SkipAudit() turns it off for handlers that audit themselves.
 * Denied requests are audited by PermissionsGuard (security.permission_denied).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const url = (req.originalUrl ?? req.url ?? '').split('?')[0];
    // Express matches routes case-insensitively: compare case-insensitively
    // on both the matched pattern and the raw path so /API/V1/ADMIN/... is audited too.
    const isAdmin = [routePathOf(req), url].some((p) => p.toLowerCase().startsWith(ADMIN_PREFIX));
    if (!MUTATING.has(req.method) || !isAdmin) return next.handle();
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, targets)) return next.handle();
    const options =
      this.reflector.getAllAndOverride<AuditOptions | undefined>(AUDIT_OPTIONS_KEY, targets) ?? {};

    const scope: AuditScope = {};
    return new Observable<unknown>((subscriber) => {
      // Run the handler inside the audit scope so services can annotate it.
      const subscription = AuditScopeStore.run(scope, () =>
        next
          .handle()
          .pipe(
            mergeMap(async (result: unknown) => {
              await this.write(req, scope, options, result);
              return result;
            }),
          )
          .subscribe(subscriber),
      );
      return () => subscription.unsubscribe();
    });
  }

  private async write(
    req: Request,
    scope: AuditScope,
    options: AuditOptions,
    result: unknown,
  ): Promise<void> {
    const derived = deriveAuditNames(req.method, routePathOf(req));
    const params = (req.params ?? {}) as Record<string, string | undefined>;
    const idParam = options.entityIdParam ?? 'id';
    const entity = responseEntity(result);
    const entityId =
      scope.entityId !== undefined
        ? scope.entityId
        : (params[idParam] ??
          Object.values(params).find((v) => typeof v === 'string') ??
          (typeof entity?.id === 'string' ? entity.id : null));

    let after = scope.after;
    if (after === undefined && req.method !== 'DELETE') {
      after =
        entity ?? (isNonEmptyObject(req.body) ? { request: toAuditJson(req.body) } : undefined);
    }
    await this.audit.recordSafe({
      action: scope.action ?? options.action ?? derived.action,
      entityType: scope.entityType ?? options.entityType ?? derived.entityType,
      entityId,
      before: scope.before,
      after,
    });
  }
}
