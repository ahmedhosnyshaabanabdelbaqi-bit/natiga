import { SetMetadata } from '@nestjs/common';

export const AUDIT_OPTIONS_KEY = 'evcar:audit:options';
export const SKIP_AUDIT_KEY = 'evcar:audit:skip';

export interface AuditOptions {
  /** e.g. "articles.publish". Default: derived from the route ("articles.update"). */
  action?: string;
  /** e.g. "article". Default: first path segment after /admin/ ("articles"). */
  entityType?: string;
  /** Route param holding the entity id. Default: "id", else the first route param. */
  entityIdParam?: string;
}

/**
 * Customizes the automatic audit record written for a mutating
 * /api/v1/admin request (see AuditInterceptor). Optional: every such
 * request is audited even without it.
 */
export const Audit = (options: AuditOptions): MethodDecorator & ClassDecorator =>
  SetMetadata(AUDIT_OPTIONS_KEY, options);

/**
 * Disables the automatic audit record for a handler that writes its own
 * records with AuditService.record() (avoids duplicates).
 */
export const SkipAudit = (): MethodDecorator & ClassDecorator => SetMetadata(SKIP_AUDIT_KEY, true);
