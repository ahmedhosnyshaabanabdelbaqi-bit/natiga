import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '@/api/auth';
import { refreshSession } from '@/api/client';
import { onSessionEvent } from '@/api/session';
import { appConfigQueryKey } from '@/api/appConfig';
import { AuthContext, type AuthContextValue, type AuthState } from './AuthContext';

/**
 * Owns the signed-in user. On mount it exchanges the httpOnly refresh cookie
 * for an access token (the token itself only ever lives in memory), and it
 * listens to session events from the API client (refresh, expiry, logout).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    refreshSession()
      .then((session) => {
        if (cancelled) return;
        setState(
          session ? { status: 'authenticated', user: session.user } : { status: 'anonymous' },
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ status: 'anonymous', reason: 'bootstrap-failed', error });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(
    () =>
      onSessionEvent((event) => {
        if (event.type === 'refreshed') {
          setState({ status: 'authenticated', user: event.user });
          return;
        }
        setState((prev) =>
          prev.status === 'anonymous'
            ? prev
            : { status: 'anonymous', reason: event.type === 'expired' ? 'expired' : 'logged-out' },
        );
        // Drop every cached admin response of the previous session; keep the
        // public app-config (branding) so the login page stays themed.
        queryClient.removeQueries({
          predicate: (q) => q.queryKey[0] !== appConfigQueryKey[0],
        });
      }),
    [queryClient],
  );

  const login = useCallback(async (email: string, password: string) => {
    const session = await authApi.login(email, password);
    return session.user;
  }, []);

  const logout = useCallback(() => authApi.logout(), []);

  const retryBootstrap = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      user: state.status === 'authenticated' ? state.user : null,
      login,
      logout,
      retryBootstrap,
    }),
    [state, login, logout, retryBootstrap],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
