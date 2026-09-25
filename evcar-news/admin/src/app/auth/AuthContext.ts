import { createContext, useContext } from 'react';
import type { AuthUser } from '@/api/types';

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: AuthUser }
  | {
      status: 'anonymous';
      /** Why we are signed out; drives the message on the login page. */
      reason?: 'expired' | 'logged-out' | 'bootstrap-failed';
      error?: unknown;
    };

export interface AuthContextValue {
  state: AuthState;
  user: AuthUser | null;
  login(email: string, password: string): Promise<AuthUser>;
  logout(): Promise<void>;
  /** Re-runs the initial cookie refresh (e.g. after the server was unreachable). */
  retryBootstrap(): void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
