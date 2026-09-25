import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryParams } from '@/api/client';
import { usersApi, usersKeys, type UserStatus } from './api';

export function useRoles(enabled = true) {
  return useQuery({
    queryKey: usersKeys.roles,
    queryFn: ({ signal }) => usersApi.roles(signal),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useUsersList(query: QueryParams) {
  return useQuery({
    queryKey: usersKeys.list(query),
    queryFn: ({ signal }) => usersApi.list(query, signal),
    placeholderData: (prev) => prev,
  });
}

export function useUser(id: string | null) {
  return useQuery({
    queryKey: usersKeys.detail(id ?? ''),
    queryFn: ({ signal }) => usersApi.get(id ?? '', signal),
    enabled: !!id,
  });
}

export function useUserSessions(id: string | null, enabled = true) {
  return useQuery({
    queryKey: usersKeys.sessions(id ?? ''),
    queryFn: ({ signal }) => usersApi.sessions(id ?? '', signal),
    enabled: !!id && enabled,
  });
}

function useInvalidateUser() {
  const qc = useQueryClient();
  return (id: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: usersKeys.detail(id) }),
      qc.invalidateQueries({ queryKey: [...usersKeys.all, 'list'] }),
    ]);
}

export function useSetUserRoles() {
  const invalidate = useInvalidateUser();
  return useMutation({
    mutationFn: ({ id, roles }: { id: string; roles: string[] }) => usersApi.setRoles(id, roles),
    onSuccess: (_d, { id }) => invalidate(id),
    meta: { successMessage: 'users:roles.saved' },
  });
}

export function useSetUserStatus() {
  const invalidate = useInvalidateUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: UserStatus; reason?: string }) =>
      usersApi.setStatus(id, status, reason),
    onSuccess: async (_d, { id }) => {
      await invalidate(id);
      await qc.invalidateQueries({ queryKey: usersKeys.sessions(id) });
    },
    meta: { successMessage: 'users:status.saved' },
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, sessionId }: { userId: string; sessionId: string }) =>
      usersApi.revokeSession(userId, sessionId),
    onSuccess: (_d, { userId }) => qc.invalidateQueries({ queryKey: usersKeys.sessions(userId) }),
    meta: { successMessage: 'users:sessions.revoked' },
  });
}

export function useRevokeAllSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => usersApi.revokeAllSessions(userId),
    onSuccess: (_d, userId) => qc.invalidateQueries({ queryKey: usersKeys.sessions(userId) }),
    meta: { successMessage: 'users:sessions.revokedAll' },
  });
}

export function usePermissionCatalog(enabled = true) {
  return useQuery({
    queryKey: usersKeys.permissions,
    queryFn: ({ signal }) => usersApi.permissions(signal),
    staleTime: 10 * 60_000,
    enabled,
  });
}

export function useSetRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, permissions }: { key: string; permissions: string[] }) =>
      usersApi.setRolePermissions(key, permissions),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: usersKeys.roles }),
        qc.invalidateQueries({ queryKey: usersKeys.all }),
      ]),
    meta: { successMessage: 'users:rolesTab.saved' },
  });
}
