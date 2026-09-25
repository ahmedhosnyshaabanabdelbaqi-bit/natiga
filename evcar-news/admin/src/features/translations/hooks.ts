import { useMutation, useQueryClient } from '@tanstack/react-query';
import { translationsApi, translationsKeys } from './api';

export function useUpdateTranslation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) => translationsApi.update(id, value),
    onSettled: () => qc.invalidateQueries({ queryKey: translationsKeys.all }),
    meta: { silentError: true, successMessage: 'translations:saved' },
  });
}

export function useUpsertTranslations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: Parameters<typeof translationsApi.upsert>[0][]) => {
      for (const item of items) await translationsApi.upsert(item);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: translationsKeys.all }),
    meta: { silentError: true, successMessage: 'translations:saved' },
  });
}
