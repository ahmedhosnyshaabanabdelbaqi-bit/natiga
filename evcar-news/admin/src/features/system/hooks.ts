import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { systemApi, systemKeys } from './api';

export function useIntegrations(enabled = true) {
  return useQuery({
    queryKey: systemKeys.integrations,
    queryFn: ({ signal }) => systemApi.integrations(signal),
    enabled,
  });
}

/** Live provider check; refreshes the list so lastSuccessAt/lastError update. */
export function useCheckIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => systemApi.check(id),
    onSettled: () => qc.invalidateQueries({ queryKey: systemKeys.integrations }),
  });
}

export function useJobs(enabled = true) {
  return useQuery({
    queryKey: systemKeys.jobs,
    queryFn: ({ signal }) => systemApi.jobs(signal),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useSystemOverview(enabled = true) {
  return useQuery({
    queryKey: systemKeys.overview,
    queryFn: ({ signal }) => systemApi.overview(signal),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useHealth(enabled = true) {
  return useQuery({
    queryKey: systemKeys.health,
    queryFn: ({ signal }) => systemApi.health(signal),
    enabled,
    refetchInterval: 60_000,
  });
}
