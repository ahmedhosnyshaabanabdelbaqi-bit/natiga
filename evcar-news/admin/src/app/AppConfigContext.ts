import { useQuery } from '@tanstack/react-query';
import { appConfigQueryKey, fetchAppConfig } from '@/api/appConfig';

/** Public app configuration (branding, markets, features...). Never blocks rendering. */
export function useAppConfig() {
  return useQuery({
    queryKey: appConfigQueryKey,
    queryFn: ({ signal }) => fetchAppConfig(signal),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
