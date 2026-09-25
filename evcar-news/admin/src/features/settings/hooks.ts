import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appConfigQueryKey } from '@/api/appConfig';
import { settingsApi, settingsKeys, type SettingKey } from './api';

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: ({ signal }) => settingsApi.getAll(signal),
  });
}

/** Settings and the public app-config (branding, flags, map…) change together. */
function useInvalidateSettings() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: settingsKeys.all }),
      qc.invalidateQueries({ queryKey: appConfigQueryKey }),
    ]);
}

export function useSaveSetting() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: ({ key, value }: { key: SettingKey; value: unknown }) =>
      settingsApi.save(key, value),
    onSuccess: invalidate,
    meta: { successMessage: 'settings:saved' },
  });
}

export function useResetSetting() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: (key: SettingKey) => settingsApi.reset(key),
    onSuccess: invalidate,
    meta: { successMessage: 'settings:resetDone' },
  });
}

export function useUploadLogo() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: (file: File) => settingsApi.uploadLogo(file),
    onSuccess: invalidate,
    meta: { successMessage: 'settings:branding.logoUploaded' },
  });
}

export function useRemoveLogo() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: () => settingsApi.removeLogo(),
    onSuccess: invalidate,
    meta: { successMessage: 'settings:branding.logoRemoved' },
  });
}
