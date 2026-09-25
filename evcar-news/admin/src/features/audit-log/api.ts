/**
 * Audit log admin API (read-only).
 *
 *   GET /admin/audit-logs?page&pageSize&sort&q&actorId&action&entityType&entityId&from&to
 *       → list envelope of AuditLogEntry (from/to are ISO-8601 instants)
 *   GET /admin/audit-logs/:id → { data: AuditLogEntry } (full before/after)
 *
 * Field names follow the `audit_logs` table (entityType, actorLabel, diff);
 * `entity` is accepted as an alias when normalising responses.
 */
import { api, getData, type QueryParams } from '@/api/client';
import type { ListResponse } from '@/api/types';
import { rowsOf } from '@/lib/listResponse';

export interface AuditActor {
  id: string;
  email?: string | null;
  displayName?: string | null;
}

export interface AuditLogEntry {
  id: string;
  createdAt: string;
  actorId: string | null;
  actor?: AuditActor | null;
  /** Snapshot of the actor's e-mail/label at the time of the action. */
  actorLabel?: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before?: unknown;
  after?: unknown;
  /** Some backends pre-compute the diff; the admin computes it when absent. */
  diff?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export const auditKeys = {
  list: (q: QueryParams) => ['admin', 'audit-logs', 'list', q] as const,
  detail: (id: string) => ['admin', 'audit-logs', 'detail', id] as const,
};

export function normalizeAuditEntry(raw: Record<string, unknown>): AuditLogEntry {
  const s = (v: unknown) => (typeof v === 'string' ? v : null);
  const actor = raw.actor && typeof raw.actor === 'object' ? (raw.actor as AuditActor) : null;
  return {
    ...(raw as unknown as AuditLogEntry),
    id: String(raw.id ?? ''),
    createdAt: s(raw.createdAt) ?? '',
    actorId: s(raw.actorId),
    actor,
    actorLabel: s(raw.actorLabel),
    action: s(raw.action) ?? '',
    entityType: s(raw.entityType) ?? s(raw.entity) ?? '',
    entityId: raw.entityId === null || raw.entityId === undefined ? null : String(raw.entityId),
  };
}

export const auditApi = {
  async list(query: QueryParams, signal?: AbortSignal): Promise<ListResponse<AuditLogEntry>> {
    const res = await api.get<ListResponse<Record<string, unknown>>>('/admin/audit-logs', query, {
      signal,
    });
    return { data: rowsOf<Record<string, unknown>>(res).map(normalizeAuditEntry), meta: res.meta };
  },
  async get(id: string, signal?: AbortSignal) {
    const raw = await getData<Record<string, unknown>>(
      `/admin/audit-logs/${encodeURIComponent(id)}`,
      undefined,
      { signal },
    );
    return normalizeAuditEntry(raw);
  },
};

/** Converts the `YYYY-MM-DD` date filters (local day) into ISO instants. */
export function dayRangeToIso(from: string, to: string): { from?: string; to?: string } {
  const out: { from?: string; to?: string } = {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) out.from = new Date(`${from}T00:00:00`).toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) out.to = new Date(`${to}T23:59:59.999`).toISOString();
  return out;
}

export function actorLabel(entry: AuditLogEntry, systemLabel: string): string {
  if (entry.actor) return entry.actor.displayName || entry.actor.email || entry.actor.id;
  return entry.actorLabel || entry.actorId || systemLabel;
}
