import { getData } from './client';
import type { AppConfig } from './types';

export const appConfigQueryKey = ['app-config'] as const;

export function fetchAppConfig(signal?: AbortSignal): Promise<AppConfig> {
  return getData<AppConfig>('/app-config', undefined, { auth: false, signal });
}
