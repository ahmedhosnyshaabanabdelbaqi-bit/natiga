import { isIP } from 'node:net';
import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '../../common/context/request-context';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { computeAuditDiff, toAuditJson } from './audit-redact';
import { AuditScopeStore, type AuditScope } from './audit-scope';

export interface AuditEntry {
  /** e.g. "articles.publish", "auth.login_failed". */
  action: string;
  /** e.g. "article", "user", "session". */
  entityType: string;
  entityId?: string | null;
  /** State before the change (secrets are redacted automatically). */
  before?: unknown;
  /** State after the change (secrets are redacted automatically). */
  after?: unknown;
  /** Defaults to the authenticated caller of the current request. */
  actorId?: string | null;
  /** Defaults to the caller's e-mail. */
  actorLabel?: string | null;
  /** Defaults to the request's client IP; pass null to store none (privacy). */
  ip?: string | null;
  /** Defaults to the request's user agent; pass null to store none (privacy). */
  userAgent?: string | null;
}

type Tx = Prisma.TransactionClient;

/**
 * Writes audit_logs rows (contract §4.3). Every mutating /api/v1/admin
 * request is recorded automatically by AuditInterceptor; modules use this
 * service to
 *  - enrich that automatic record with before/after state:
 *      this.audit.annotate({ entityId: article.id, before, after });
 *  - record security events or changes outside /admin:
 *      await this.audit.record({ action: 'auth.password_changed', entityType: 'user', entityId });
 *    (pass a transaction client as 2nd argument to write atomically with the change).
 * ip, user agent, request id and actor come from the request context.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Adds details to the automatic record of the current admin request (no-op elsewhere). */
  annotate(patch: AuditScope): void {
    const scope = AuditScopeStore.current();
    if (scope) Object.assign(scope, patch);
  }

  /** True while an automatic admin audit record is being collected. */
  inAuditedRequest(): boolean {
    return AuditScopeStore.current() !== undefined;
  }

  /** Writes one audit row. Throws on database errors (use `recordSafe` for fire-and-forget). */
  async record(entry: AuditEntry, tx?: Tx): Promise<void> {
    await (tx ?? this.prisma).auditLog.create({ data: this.toRow(entry) });
  }

  /** Like record() but never throws (failures are logged). */
  async recordSafe(entry: AuditEntry): Promise<void> {
    try {
      await this.record(entry);
    } catch (err) {
      this.logger.error(
        { err, action: entry.action },
        `Failed to write audit log entry ${entry.action}`,
      );
    }
  }

  private toRow(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
    const ctx = RequestContext.get();
    const before = toAuditJson(entry.before);
    const after = toAuditJson(entry.after);
    const diff = computeAuditDiff(before, after);
    const actorId = entry.actorId !== undefined ? entry.actorId : (ctx?.userId ?? null);
    const actorLabel =
      entry.actorLabel !== undefined
        ? entry.actorLabel
        : actorId && actorId === ctx?.userId
          ? (ctx?.userLabel ?? null)
          : null;
    return {
      action: entry.action.slice(0, 100),
      entityType: entry.entityType.slice(0, 64),
      entityId: entry.entityId ? String(entry.entityId).slice(0, 64) : null,
      actorId,
      actorLabel: actorLabel ? actorLabel.slice(0, 320) : null,
      before: jsonOrDbNull(before),
      after: jsonOrDbNull(after),
      diff: jsonOrDbNull(diff),
      ip: auditIp(entry.ip !== undefined ? entry.ip : ctx?.ip),
      userAgent:
        (entry.userAgent !== undefined ? entry.userAgent : ctx?.userAgent)?.slice(0, 512) ?? null,
      requestId: ctx?.requestId?.slice(0, 64) ?? null,
    };
  }
}

function auditIp(ip: string | null | undefined): string | null {
  return ip && isIP(stripZone(ip)) ? stripZone(ip) : null;
}

function stripZone(ip: string): string {
  // IPv6 zone ids ("fe80::1%eth0") are not valid inet values.
  const pct = ip.indexOf('%');
  return pct === -1 ? ip : ip.slice(0, pct);
}

function jsonOrDbNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === undefined || value === null) return Prisma.DbNull;
  return value;
}
