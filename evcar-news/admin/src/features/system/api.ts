/**
 * System status admin API (backend src/modules/system + src/providers).
 *
 *   GET  /admin/system/integrations            → { data: { items: IntegrationStatusDto[], capabilities, note } }
 *        (settings.read or integrations.read)
 *   POST /admin/system/integrations/:id/check  → { data: ProviderCheckDto } (settings.write or integrations.write)
 *   GET  /admin/system/jobs                    → { data: JobsOverviewDto } (system.read)
 *   GET  /admin/system/jobs/:queue?state=failed → list of JobViewDto (system.read)
 *   GET  /admin/system/overview                → { data: SystemOverviewDto } (system.read)
 *   GET  /health (public)                      → { data: HealthDto } — version, uptime, dependency checks
 *
 * Provider status never contains secret values, only which variables are missing.
 */
import { api } from '@/api/client';
import { ApiError, CLIENT_ERROR_CODES, isApiError } from '@/api/errors';
import type { components } from '@/api/schema';
import type { ListResponse } from '@/api/types';

type Schemas = components['schemas'];

export type IntegrationStatus = Schemas['IntegrationStatusDto'];
export type Capabilities = Schemas['CapabilitiesDto'];
export type ProviderCheck = Schemas['ProviderCheckDto'];
export type QueueSummary = Schemas['QueueSummaryDto'];
export type FailedJob = Schemas['JobViewDto'];
export type SystemOverview = Schemas['SystemOverviewDto'];
export type Health = Schemas['HealthDto'];

export interface IntegrationsReport {
  items: IntegrationStatus[];
  capabilities: Capabilities | null;
  note: string | null;
}

export interface JobsStatus {
  redis: 'up' | 'down';
  workersEnabledHere: boolean;
  queues: QueueSummary[];
  recentFailures: FailedJob[];
}

export type IntegrationHealth = 'ok' | 'error' | 'not_configured' | 'disabled';

export const systemKeys = {
  integrations: ['admin', 'system', 'integrations'] as const,
  jobs: ['admin', 'system', 'jobs'] as const,
  overview: ['admin', 'system', 'overview'] as const,
  health: ['admin', 'system', 'health'] as const,
};

/** Provider type (storage, mail, stations…) used to group cards. */
export const integrationCategory = (i: IntegrationStatus) => i.type || i.id.split('.')[0] || i.id;

export function integrationHealth(i: IntegrationStatus): IntegrationHealth {
  if (!i.configured) return 'not_configured';
  if (!i.enabled) return 'disabled';
  if (i.lastError) {
    const errAt = i.lastErrorAt ? Date.parse(i.lastErrorAt) : Number.POSITIVE_INFINITY;
    const okAt = i.lastSuccessAt ? Date.parse(i.lastSuccessAt) : Number.NEGATIVE_INFINITY;
    if (errAt >= okAt) return 'error';
  }
  return 'ok';
}

export function normalizeIntegrations(data: unknown): IntegrationsReport {
  const obj = data && typeof data === 'object' ? (data as Partial<Schemas['IntegrationsDto']>) : {};
  const items = (Array.isArray(obj.items) ? obj.items : [])
    .filter((i): i is IntegrationStatus => !!i && typeof i.id === 'string')
    .sort(
      (a, b) =>
        integrationCategory(a).localeCompare(integrationCategory(b)) ||
        a.name.localeCompare(b.name),
    );
  return {
    items,
    capabilities: obj.capabilities ?? null,
    note: typeof obj.note === 'string' ? obj.note : null,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** A response that does not match the documented DTO is an error, not empty data. */
function invalidResponse(what: string): ApiError {
  return new ApiError({
    status: 200,
    code: CLIENT_ERROR_CODES.invalidResponse,
    message: `Unexpected ${what} response from the API`,
  });
}

function assertOverview(v: unknown): asserts v is SystemOverview {
  if (
    !isObj(v) ||
    !isObj(v.counts) ||
    !isObj(v.staleData) ||
    !isObj(v.imports) ||
    !Array.isArray(v.warnings)
  )
    throw invalidResponse('system overview');
}

function assertJobs(v: unknown): asserts v is Schemas['JobsOverviewDto'] {
  if (!isObj(v) || !Array.isArray(v.queues)) throw invalidResponse('jobs');
}

export const systemApi = {
  async integrations(signal?: AbortSignal): Promise<IntegrationsReport> {
    const res = await api.get<{ data: unknown }>('/admin/system/integrations', undefined, {
      signal,
    });
    return normalizeIntegrations(res?.data);
  },
  async check(id: string): Promise<ProviderCheck | undefined> {
    const res = await api.post<{ data: ProviderCheck }>(
      `/admin/system/integrations/${encodeURIComponent(id)}/check`,
    );
    return res?.data;
  },
  async jobs(signal?: AbortSignal): Promise<JobsStatus> {
    const res = await api.get<{ data: unknown }>('/admin/system/jobs', undefined, { signal });
    const overview = res?.data;
    assertJobs(overview);
    // Latest failures of the queues that report any (the overview only has counts).
    const failing = overview.queues.filter((q) => (q.counts?.failed ?? 0) > 0).slice(0, 5);
    const lists = await Promise.all(
      failing.map((q) =>
        api
          .get<ListResponse<FailedJob>>(
            `/admin/system/jobs/${encodeURIComponent(q.name)}`,
            { state: 'failed', pageSize: 5 },
            { signal },
          )
          .then((r) => r?.data ?? [])
          .catch((error: unknown) => {
            if (isApiError(error)) return [];
            throw error;
          }),
      ),
    );
    const recentFailures = lists
      .flat()
      .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))
      .slice(0, 10);
    return { ...overview, recentFailures };
  },
  async overview(signal?: AbortSignal): Promise<SystemOverview> {
    const res = await api.get<{ data: unknown }>('/admin/system/overview', undefined, { signal });
    const data = res?.data;
    assertOverview(data);
    return data;
  },
  /** Public health endpoint; a 503 body still carries the per-dependency checks. */
  async health(signal?: AbortSignal): Promise<Health | null> {
    try {
      const res = await api.get<{ data: Health }>('/health', undefined, { signal, auth: false });
      return res?.data ?? null;
    } catch (error) {
      if (isApiError(error) && error.status === 503) {
        const body = error.details as { data?: Health } | undefined;
        if (body?.data) return body.data;
      }
      throw error;
    }
  },
};
