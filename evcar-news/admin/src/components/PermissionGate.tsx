import type { ReactNode } from 'react';
import { usePermissions } from '@/app/auth/usePermissions';

export interface PermissionGateProps {
  /** Render when at least one of these is granted. */
  anyOf?: readonly string[];
  /** Render when all of these are granted. */
  allOf?: readonly string[];
  /** Rendered when the check fails (default: nothing). */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Hides UI the current user is not allowed to use. Purely cosmetic: the
 * backend enforces every permission server-side.
 */
export function PermissionGate({ anyOf, allOf, fallback = null, children }: PermissionGateProps) {
  const { can } = usePermissions();
  const requirement = { ...(anyOf ? { anyOf } : {}), ...(allOf ? { allOf } : {}) };
  return <>{can(requirement) ? children : fallback}</>;
}
