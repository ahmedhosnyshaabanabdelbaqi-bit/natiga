import { Outlet } from 'react-router';
import type { FeatureDefinition } from '@/app/features';
import { ForbiddenPage } from '@/app/pages/ForbiddenPage';
import { canSeeFeature } from '@/features/registry';
import { useAuth } from './AuthContext';

/** Renders the 403 page in place when the user lacks the section permission. */
export function FeatureGuard({ feature }: { feature: FeatureDefinition }) {
  const { user } = useAuth();
  if (!canSeeFeature(feature, user)) return <ForbiddenPage />;
  return <Outlet />;
}
