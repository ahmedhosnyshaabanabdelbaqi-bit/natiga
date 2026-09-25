/**
 * Markets & currencies admin API (backend src/modules/markets).
 *
 *   GET    /admin/markets             → { data: AdminMarketDto[] }
 *   POST   /admin/markets             CreateMarketDto (new markets start disabled unless enabled:true)
 *   PATCH  /admin/markets/:code       UpdateMarketDto → 409 MARKET_IS_DEFAULT when disabling the default
 *   GET    /admin/currencies          → { data: CurrencyDto[] }
 *   POST   /admin/currencies          CreateCurrencyDto
 *   PATCH  /admin/currencies/:code    UpdateCurrencyDto
 *   DELETE /admin/currencies/:code    → 204, or 409 CURRENCY_IN_USE
 *
 * A market's currency must exist in /admin/currencies. Markets are disabled
 * rather than deleted from the admin (content may reference them).
 */
import { api } from '@/api/client';
import type { components } from '@/api/schema';
import type { ItemResponse } from '@/api/types';
import { fetchAllRows, rowsOf } from '@/lib/listResponse';

export type Currency = components['schemas']['CurrencyDto'];
export type CurrencyInput = components['schemas']['CreateCurrencyDto'];

export type UnitSystem = 'metric' | 'imperial';
export type DriveSide = 'lhd' | 'rhd';

export interface AdminMarket {
  code: string;
  nameAr: string;
  nameEn: string;
  currencyCode: string;
  timezone: string;
  defaultLanguage: string;
  unitSystem: UnitSystem;
  driveSide: DriveSide;
  enabled: boolean;
  sortOrder: number;
  /** The default market (settings `defaults.defaultMarket`) cannot be disabled. */
  isDefault: boolean;
  updatedAt?: string;
}

export type AdminMarketInput = Omit<AdminMarket, 'updatedAt' | 'isDefault'>;

export const marketsKeys = { all: ['admin', 'markets'] as const };

/** Maps an AdminMarketDto row (the nested `currency` object is not needed here). */
export function normalizeMarket(raw: Record<string, unknown>): AdminMarket {
  const s = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
  return {
    code: s(raw.code),
    nameAr: s(raw.nameAr),
    nameEn: s(raw.nameEn),
    currencyCode: s(raw.currencyCode),
    timezone: s(raw.timezone),
    defaultLanguage: s(raw.defaultLanguage, 'ar'),
    unitSystem: raw.unitSystem === 'imperial' ? 'imperial' : 'metric',
    driveSide: raw.driveSide === 'rhd' ? 'rhd' : 'lhd',
    enabled: raw.enabled !== false,
    sortOrder: typeof raw.sortOrder === 'number' ? raw.sortOrder : 0,
    isDefault: raw.isDefault === true,
    ...(typeof raw.updatedAt === 'string' ? { updatedAt: raw.updatedAt } : {}),
  };
}

export const marketsApi = {
  async list(signal?: AbortSignal): Promise<AdminMarket[]> {
    const rows = await fetchAllRows<Record<string, unknown>>('/admin/markets', signal);
    return rows
      .map(normalizeMarket)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  },
  async create(input: AdminMarketInput) {
    const res = await api.post<ItemResponse<Record<string, unknown>>>('/admin/markets', input);
    return res?.data ? normalizeMarket(res.data) : undefined;
  },
  async update(code: string, patch: Partial<Omit<AdminMarketInput, 'code'>>) {
    const res = await api.patch<ItemResponse<Record<string, unknown>>>(
      `/admin/markets/${encodeURIComponent(code)}`,
      patch,
    );
    return res?.data ? normalizeMarket(res.data) : undefined;
  },
};

export const currenciesKeys = { all: ['admin', 'currencies'] as const };

export const currenciesApi = {
  async list(signal?: AbortSignal): Promise<Currency[]> {
    const res = await api.get<{ data: Currency[] }>('/admin/currencies', undefined, { signal });
    return rowsOf<Currency>(res).sort((a, b) => a.code.localeCompare(b.code));
  },
  async create(input: CurrencyInput) {
    const res = await api.post<ItemResponse<Currency>>('/admin/currencies', input);
    return res?.data;
  },
  async update(code: string, patch: Partial<Omit<CurrencyInput, 'code'>>) {
    const res = await api.patch<ItemResponse<Currency>>(
      `/admin/currencies/${encodeURIComponent(code)}`,
      patch,
    );
    return res?.data;
  },
  async remove(code: string): Promise<void> {
    await api.delete(`/admin/currencies/${encodeURIComponent(code)}`);
  },
};
