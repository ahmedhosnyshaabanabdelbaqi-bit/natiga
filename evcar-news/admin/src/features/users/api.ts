/**
 * Users & roles admin API. Shapes come from the generated OpenAPI types
 * (`npm run api:types` → src/api/schema.d.ts), so a backend change that
 * breaks them fails `npm run typecheck`.
 *
 *   GET    /admin/users?page&pageSize&sort&q&role&status   → list of AdminUserListItemDto
 *   GET    /admin/users/:id                                 → { data: AdminUserDetailDto }
 *   PUT    /admin/users/:id/roles        { roles }          → { data: AdminUserDetailDto }
 *   PATCH  /admin/users/:id/status       { status, reason? } (users.block) → detail
 *   GET    /admin/users/:id/sessions                        → { data: SessionDto[] }
 *   DELETE /admin/users/:id/sessions/:sessionId             → 204
 *   DELETE /admin/users/:id/sessions                        → { data: { revoked } }
 *   GET    /admin/roles                                     → { data: RoleDto[] }
 *   GET    /admin/permissions                               → { data: PermissionDto[] }
 *   PUT    /admin/roles/:key/permissions { permissions }    (roles.manage + owner) → { data: RoleDto }
 */
import { api, getData, type QueryParams } from '@/api/client';
import type { components } from '@/api/schema';
import type { ItemResponse, ListResponse } from '@/api/types';
import { rowsOf } from '@/lib/listResponse';

type Schemas = components['schemas'];

export type UserStatus = Schemas['AdminUserListItemDto']['status'];
/** List rows carry the base fields; the detail endpoint adds the optional ones. */
export type AdminUser = Schemas['AdminUserListItemDto'] &
  Partial<Omit<Schemas['AdminUserDetailDto'], keyof Schemas['AdminUserListItemDto']>>;
export type AdminUserDetail = Schemas['AdminUserDetailDto'];
export type AdminRole = Schemas['RoleDto'];
export type AdminSession = Schemas['SessionDto'];
export type AdminPermission = Schemas['PermissionDto'];

export const usersKeys = {
  all: ['admin', 'users'] as const,
  list: (q: QueryParams) => ['admin', 'users', 'list', q] as const,
  detail: (id: string) => ['admin', 'users', 'detail', id] as const,
  sessions: (id: string) => ['admin', 'users', 'sessions', id] as const,
  roles: ['admin', 'roles'] as const,
  permissions: ['admin', 'permissions'] as const,
};

const enc = encodeURIComponent;

export const usersApi = {
  list(query: QueryParams, signal?: AbortSignal) {
    return api.get<ListResponse<AdminUser>>('/admin/users', query, { signal });
  },
  get(id: string, signal?: AbortSignal) {
    return getData<AdminUserDetail>(`/admin/users/${enc(id)}`, undefined, { signal });
  },
  async setRoles(id: string, roles: string[]) {
    const res = await api.put<ItemResponse<AdminUserDetail>>(`/admin/users/${enc(id)}/roles`, {
      roles,
    });
    return res?.data;
  },
  async setStatus(id: string, status: UserStatus, reason?: string) {
    const res = await api.patch<ItemResponse<AdminUserDetail>>(`/admin/users/${enc(id)}/status`, {
      status,
      ...(reason ? { reason } : {}),
    });
    return res?.data;
  },
  async sessions(id: string, signal?: AbortSignal) {
    const res = await api.get<{ data: AdminSession[] }>(
      `/admin/users/${enc(id)}/sessions`,
      undefined,
      { signal },
    );
    return rowsOf<AdminSession>(res);
  },
  async revokeSession(id: string, sessionId: string): Promise<void> {
    await api.delete(`/admin/users/${enc(id)}/sessions/${enc(sessionId)}`);
  },
  async revokeAllSessions(id: string): Promise<number | undefined> {
    const res = await api.delete<ItemResponse<{ revoked: number }>>(
      `/admin/users/${enc(id)}/sessions`,
    );
    return res?.data?.revoked;
  },
  async roles(signal?: AbortSignal) {
    const res = await api.get<{ data: AdminRole[] }>('/admin/roles', undefined, { signal });
    return rowsOf<AdminRole>(res);
  },
  async permissions(signal?: AbortSignal) {
    const res = await api.get<{ data: AdminPermission[] }>('/admin/permissions', undefined, {
      signal,
    });
    return rowsOf<AdminPermission>(res);
  },
  async setRolePermissions(key: string, permissions: string[]) {
    const res = await api.put<ItemResponse<AdminRole>>(`/admin/roles/${enc(key)}/permissions`, {
      permissions,
    });
    return res?.data;
  },
};

export function roleLabel(
  role: Pick<AdminRole, 'nameAr' | 'nameEn' | 'key'> | undefined,
  lang: string,
  key?: string,
) {
  if (!role) return key ?? '';
  return (lang === 'ar' ? role.nameAr : role.nameEn) || role.key;
}

/**
 * Built-in roles have localized descriptions in users.json (roleDescriptions);
 * the server's text (English) is the fallback for roles added later.
 */
export function roleDescription(
  role: Pick<AdminRole, 'key' | 'description'>,
  t: (key: string, opts?: { defaultValue?: string }) => string,
): string | undefined {
  return (
    t(`users:roleDescriptions.${role.key}`, { defaultValue: role.description ?? '' }) || undefined
  );
}

export function groupPermissions(perms: readonly string[]): [string, string[]][] {
  const groups = new Map<string, string[]>();
  for (const p of perms) {
    const [group = p, ...rest] = p.split('.');
    const action = rest.join('.') || p;
    const list = groups.get(group) ?? [];
    list.push(action);
    groups.set(group, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** The API only lists live sessions; a session can still pass its expiry while the page is open. */
export function sessionState(s: AdminSession, now = Date.now()): 'active' | 'expired' {
  if (s.expiresAt && new Date(s.expiresAt).getTime() <= now) return 'expired';
  return 'active';
}
