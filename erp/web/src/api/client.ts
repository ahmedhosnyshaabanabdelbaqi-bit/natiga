import axios, { AxiosError } from 'axios';

/**
 * Single HTTP client for the API.
 *
 * Domain errors arrive with a stable machine code (`error`) plus an
 * Arabic message, so screens branch on the code and show the message
 * rather than parsing text.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

const TOKEN_KEY = 'erp.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // An expired or revoked token ends the session rather than leaving the
    // user clicking through screens that will all fail.
    if (error.response?.status === 401 && getToken()) {
      setToken(null);
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export interface ApiErrorShape {
  error?: string;
  message?: string;
  context?: Record<string, unknown>;
  errors?: Record<string, string[]>;
}

/** Turn any failure into a message that is safe and useful to show. */
export function errorMessage(error: unknown): string {
  const err = error as AxiosError<ApiErrorShape>;
  const data = err.response?.data;

  if (data?.errors) {
    const first = Object.values(data.errors)[0];
    if (first?.length) return first[0];
  }
  if (data?.message) return data.message;

  if (err.code === 'ERR_NETWORK') {
    return 'تعذر الوصول إلى الخادم. تحقق من الاتصال بالشبكة.';
  }
  if (err.response?.status === 403) {
    return 'لا تملك صلاحية تنفيذ هذه العملية.';
  }
  if (err.response?.status === 404) {
    return 'العنصر المطلوب غير موجود.';
  }

  return 'حدث خطأ غير متوقع. حاول مرة أخرى.';
}

export function errorCode(error: unknown): string | undefined {
  return (error as AxiosError<ApiErrorShape>).response?.data?.error;
}

/** Field-level validation messages, for rendering next to each input. */
export function fieldErrors(error: unknown): Record<string, string> {
  const errors = (error as AxiosError<ApiErrorShape>).response?.data?.errors ?? {};
  return Object.fromEntries(
    Object.entries(errors).map(([field, messages]) => [field, messages[0]]),
  );
}
