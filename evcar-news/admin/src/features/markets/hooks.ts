import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appConfigQueryKey } from '@/api/appConfig';
import {
  currenciesApi,
  currenciesKeys,
  marketsApi,
  marketsKeys,
  type AdminMarketInput,
  type CurrencyInput,
} from './api';

export function useMarkets() {
  return useQuery({ queryKey: marketsKeys.all, queryFn: ({ signal }) => marketsApi.list(signal) });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: marketsKeys.all }),
      qc.invalidateQueries({ queryKey: appConfigQueryKey }),
    ]);
}

export function useCreateMarket() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: AdminMarketInput) => marketsApi.create(input),
    onSuccess: invalidate,
    meta: { silentError: true, successMessage: 'markets:created' },
  });
}

export function useUpdateMarket() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      code,
      patch,
    }: {
      code: string;
      patch: Partial<Omit<AdminMarketInput, 'code'>>;
    }) => marketsApi.update(code, patch),
    onSuccess: invalidate,
    meta: { successMessage: 'markets:updated' },
  });
}

export function useCurrencies() {
  return useQuery({
    queryKey: currenciesKeys.all,
    queryFn: ({ signal }) => currenciesApi.list(signal),
  });
}

function useInvalidateCurrencies() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: currenciesKeys.all }),
      qc.invalidateQueries({ queryKey: marketsKeys.all }),
      qc.invalidateQueries({ queryKey: appConfigQueryKey }),
    ]);
}

export function useSaveCurrency() {
  const invalidate = useInvalidateCurrencies();
  return useMutation({
    mutationFn: ({ input, existing }: { input: CurrencyInput; existing: boolean }) => {
      if (!existing) return currenciesApi.create(input);
      const { code, ...patch } = input;
      return currenciesApi.update(code, patch);
    },
    onSuccess: invalidate,
    meta: { silentError: true, successMessage: 'markets:currencies.saved' },
  });
}

export function useDeleteCurrency() {
  const invalidate = useInvalidateCurrencies();
  return useMutation({
    mutationFn: (code: string) => currenciesApi.remove(code),
    onSuccess: invalidate,
    meta: { successMessage: 'markets:currencies.deleted' },
  });
}
