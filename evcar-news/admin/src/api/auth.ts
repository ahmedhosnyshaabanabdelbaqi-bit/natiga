import { api, applySession, getData, waitForPendingRefresh } from './client';
import { tokenStore } from './tokenStore';
import { emitSessionEvent } from './session';
import type { AuthSession, AuthUser, ItemResponse } from './types';

function browserLabel(): string {
  if (typeof navigator === 'undefined') return 'browser';
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'browser';
}

export const authApi = {
  async login(email: string, password: string): Promise<AuthSession> {
    const res = await api.post<ItemResponse<AuthSession>>(
      '/auth/login',
      { email, password, deviceName: `EV Car News Admin (${browserLabel()})` },
      { auth: false },
    );
    return applySession(res.data);
  },

  async logout(): Promise<void> {
    await waitForPendingRefresh();
    try {
      await api.post('/auth/logout', {}, { refreshOnExpired: false });
    } finally {
      tokenStore.clear();
      emitSessionEvent({ type: 'logged-out' });
    }
  },

  async forgotPassword(email: string): Promise<void> {
    await api.post('/auth/forgot-password', { email }, { auth: false });
  },

  async resetPassword(token: string, password: string): Promise<void> {
    await api.post('/auth/reset-password', { token, password }, { auth: false });
  },

  me(): Promise<AuthUser> {
    return getData<AuthUser>('/me');
  },
};
