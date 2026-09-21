import { create } from 'zustand';
import { api, tokenStore, toApiError } from './api';

export interface CurrentUser {
  id: number;
  name: string;
  username: string;
  company_id: number | null;
  company_name: string | null;
  branch_id: number | null;
  is_super_admin: boolean;
  must_change_password?: boolean;
  roles: Array<{ id: number; code: string; name_ar: string }>;
  permissions: string[];
  salesman: { id: number; code: string; warehouse_id: number | null; primary_role: string } | null;
  scopes: { branch: number[]; warehouse: number[]; region: number[] };
  can_see_cost: boolean;
}

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  mustChangePassword: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  loadMe: () => Promise<void>;
  clearPasswordFlag: () => void;
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
}

function hasPermission(user: CurrentUser | null, code: string): boolean {
  if (!user) return false;
  if (user.is_super_admin) return true;
  if (user.permissions.includes(code)) return true;
  // دعم البدائل: sales_invoice.* يمنح كل أذونات المجموعة
  const parts = code.split('.');
  while (parts.length > 1) {
    parts.pop();
    if (user.permissions.includes(`${parts.join('.')}.*`)) return true;
  }
  return false;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  mustChangePassword: false,
  error: null,

  login: async (username, password) => {
    set({ error: null });
    try {
      const { data } = await api.post('/auth/login', { username, password, device_name: 'web' });
      tokenStore.set(data.data.token);
      set({
        user: data.data.user,
        mustChangePassword: data.data.must_change_password,
        loading: false,
        error: null,
      });
      return true;
    } catch (error) {
      set({ error: toApiError(error).message, loading: false });
      return false;
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // الخروج المحلي يتم على أي حال
    }
    tokenStore.clear();
    set({ user: null, mustChangePassword: false });
  },

  clearPasswordFlag: () => set({ mustChangePassword: false }),

  loadMe: async () => {
    if (!tokenStore.get()) {
      set({ user: null, loading: false });
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      // الراية تُقرأ عند استعادة الجلسة أيضًا، وإلا تجاوزها المستخدم بتحديث الصفحة
      set({
        user: data.data,
        mustChangePassword: Boolean(data.data.must_change_password),
        loading: false,
      });
    } catch {
      tokenStore.clear();
      set({ user: null, loading: false });
    }
  },

  can: (permission) => hasPermission(get().user, permission),
  canAny: (permissions) => permissions.some((p) => hasPermission(get().user, p)),
}));
