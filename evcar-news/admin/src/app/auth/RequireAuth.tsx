import { Navigate, Outlet, useLocation } from 'react-router';
import { LoadingState } from '@/components/StateViews';
import { useAuth } from './AuthContext';

/** Protects every admin route; sends anonymous users to /login?next=... */
export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') return <LoadingState minHeight={320} />;

  if (state.status === 'anonymous') {
    const params = new URLSearchParams();
    const current = `${location.pathname}${location.search}`;
    if (state.reason !== 'logged-out' && current !== '/') params.set('next', current);
    if (state.reason === 'expired') params.set('reason', 'expired');
    const qs = params.toString();
    return <Navigate to={qs ? `/login?${qs}` : '/login'} replace />;
  }

  return <Outlet />;
}
