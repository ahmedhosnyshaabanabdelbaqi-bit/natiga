import { isValidTimeZone } from '@/lib/intl';
import type { AdminMarketInput } from './api';

export function validateMarket(values: AdminMarketInput, t: (k: string) => string) {
  return {
    code: /^[A-Z]{2}$/.test(values.code) ? null : t('markets:validation.code'),
    nameAr: values.nameAr.trim() ? null : t('common:validation.required'),
    nameEn: values.nameEn.trim() ? null : t('common:validation.required'),
    currencyCode: /^[A-Z]{3}$/.test(values.currencyCode) ? null : t('markets:validation.currency'),
    timezone:
      values.timezone && isValidTimeZone(values.timezone) ? null : t('markets:validation.timezone'),
  };
}
