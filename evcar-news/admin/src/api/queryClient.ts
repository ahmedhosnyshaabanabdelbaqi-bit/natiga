import { MutationCache, QueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import i18n from '@/app/i18n';
import { isApiError } from './errors';
import { describeError } from './describeError';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** Skip the global error toast (the form shows the error inline). */
      silentError?: boolean;
      /** i18n key (with namespace) of a success toast. */
      successMessage?: string;
    };
  }
}

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error)) {
    // Never retry client errors (auth, permission, validation, not found).
    if (error.status >= 400 && error.status < 500) return false;
  }
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        if (mutation.meta?.silentError) return;
        const { title, message } = describeError(error, i18n.t.bind(i18n));
        notifications.show({ color: 'red', title, message, autoClose: 8000 });
      },
      onSuccess: (_data, _vars, _ctx, mutation) => {
        const key = mutation.meta?.successMessage;
        if (key) notifications.show({ color: 'teal', message: i18n.t(key) });
      },
    }),
  });
}
