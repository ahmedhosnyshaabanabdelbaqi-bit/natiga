/**
 * Public API of the audit module for other modules:
 *
 *   import { AuditService, Audit, SkipAudit } from '../audit';
 *
 * Every mutating /api/v1/admin request is audited automatically; use
 * `auditService.annotate({ entityId, before, after })` to add state, or
 * `auditService.record({...})` for events outside /admin.
 */
export { AuditService, type AuditEntry } from './audit.service';
export { Audit, SkipAudit, type AuditOptions } from './audit.decorators';
