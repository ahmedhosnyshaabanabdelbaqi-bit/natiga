/**
 * String overrides (table `translations`, unique (namespace, key, locale)),
 * backend src/modules/i18n. Server namespaces (errors, notifications, labels)
 * must name an existing catalog entry and keep its {placeholders}; other
 * namespaces are free UI strings served by GET /translations.
 *
 *   GET    /admin/translations?page&pageSize&sort&q&namespace&locale → list of TranslationDto
 *   POST   /admin/translations   { namespace, key, locale, value }   → 201, 409 when it exists
 *   PATCH  /admin/translations/:id  { value }                        → { data: TranslationDto }
 *   DELETE /admin/translations/:id                                    → 204
 */
import { api, type QueryParams } from '@/api/client';
import { isApiError } from '@/api/errors';
import type { components } from '@/api/schema';
import type { ItemResponse, ListResponse } from '@/api/types';

export type TranslationOverride = components['schemas']['TranslationDto'];
export type TranslationUpsert = components['schemas']['CreateTranslationDto'];

export const translationsKeys = {
  all: ['admin', 'translations'] as const,
  list: (q: QueryParams) => ['admin', 'translations', 'list', q] as const,
};

export const translationsApi = {
  list(query: QueryParams, signal?: AbortSignal) {
    return api.get<ListResponse<TranslationOverride>>('/admin/translations', query, { signal });
  },
  async create(input: TranslationUpsert) {
    const res = await api.post<ItemResponse<TranslationOverride>>('/admin/translations', input);
    return res?.data;
  },
  async update(id: string, value: string) {
    const res = await api.patch<ItemResponse<TranslationOverride>>(
      `/admin/translations/${encodeURIComponent(id)}`,
      { value },
    );
    return res?.data;
  },
  /** Create, or update the existing row when (namespace, key, locale) is taken (409). */
  async upsert(input: TranslationUpsert) {
    try {
      return await translationsApi.create(input);
    } catch (error) {
      if (!isApiError(error) || error.status !== 409) throw error;
      const existing = await translationsApi.list({
        namespace: input.namespace,
        locale: input.locale,
        q: input.key,
        pageSize: 100,
      });
      const row = existing.data.find((r) => r.key === input.key);
      if (!row) throw error;
      return translationsApi.update(row.id, input.value);
    }
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/admin/translations/${encodeURIComponent(id)}`);
  },
};

export const NAMESPACE_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
export const KEY_PATTERN = /^[A-Za-z0-9_.-]{1,191}$/;
