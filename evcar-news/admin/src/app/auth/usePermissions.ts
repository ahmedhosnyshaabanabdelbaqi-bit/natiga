import { useCallback } from 'react';
import { checkPermissions, type PermissionRequirement } from '@/app/permissions';
import { useAuth } from './AuthContext';

export function usePermissions() {
  const { user } = useAuth();
  const granted = user?.permissions;
  const can = useCallback(
    (requirement: PermissionRequirement | string | undefined) =>
      checkPermissions(
        granted,
        typeof requirement === 'string' ? { anyOf: [requirement] } : requirement,
      ),
    [granted],
  );
  return { can, permissions: granted ?? [] };
}
