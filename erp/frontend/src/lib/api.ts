import axios, { AxiosError } from 'axios';

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api/v1';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { Accept: 'application/json' },
});

const TOKEN_KEY = 'erp.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const deviceUid = localStorage.getItem('erp.device_uid');
  if (deviceUid) config.headers['X-Device-Uid'] = deviceUid;
  return config;
});

/** خطأ مُترجم للعرض: رسالة عربية + رمز ثابت + سياق. */
export interface ApiError {
  code: string;
  message: string;
  status: number;
  context?: Record<string, unknown>;
  fieldErrors?: Record<string, string[]>;
}

export function toApiError(error: unknown): ApiError {
  const axiosError = error as AxiosError<{
    error_code?: string;
    message?: string;
    context?: Record<string, unknown>;
    errors?: Record<string, string[]>;
  }>;

  if (!axiosError.response) {
    return {
      code: 'network.unreachable',
      message: 'تعذّر الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة.',
      status: 0,
    };
  }

  const { status, data } = axiosError.response;

  return {
    code: data?.error_code ?? 'http.error',
    message: data?.message ?? 'حدث خطأ غير متوقع.',
    status,
    context: data?.context,
    fieldErrors: data?.errors,
  };
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // انتهاء الجلسة: أعد للمستخدم شاشة الدخول بدل شاشة مكسورة
    if (error.response?.status === 401 && !error.config?.url?.includes('auth/login')) {
      tokenStore.clear();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
