/**
 * Helpers of the discovery-* e2e specs (search, home, favorites,
 * encyclopedia, services directory). Every row is FICTIONAL test data that
 * only lives in the per-run test database.
 */
import { randomBytes } from 'node:crypto';
import type { TestApp } from './utils/test-app';

export const uid = () => randomBytes(3).toString('hex');

export interface EntrySpec {
  categoryKey?: string;
  titleAr?: string;
  titleEn?: string;
  bodyAr?: string;
  bodyEn?: string;
  status?: 'draft' | 'in_review' | 'published';
  reviewed?: boolean;
  sortOrder?: number;
}

/** Encyclopedia entry written directly (published entries carry a technical review). */
export async function createEntry(t: TestApp, spec: EntrySpec = {}) {
  const status = spec.status ?? 'published';
  const reviewed = spec.reviewed ?? status === 'published';
  const translations = [
    spec.titleAr !== undefined
      ? {
          locale: 'ar',
          title: spec.titleAr,
          summary: 'ملخص اختبار آلي.',
          bodyHtml: `<p>${spec.bodyAr ?? 'نص اختبار آلي فقط.'}</p>`,
          bodyText: spec.bodyAr ?? 'نص اختبار آلي فقط.',
        }
      : null,
    spec.titleEn !== undefined
      ? {
          locale: 'en',
          title: spec.titleEn,
          summary: 'Automated test summary.',
          bodyHtml: `<p>${spec.bodyEn ?? 'Automated test body only.'}</p>`,
          bodyText: spec.bodyEn ?? 'Automated test body only.',
        }
      : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  return t.prisma.encyclopediaEntry.create({
    data: {
      slug: `e2e-entry-${uid()}`,
      categoryKey: spec.categoryKey ?? 'home_charging',
      status,
      sortOrder: spec.sortOrder ?? 0,
      technicalReviewedAt: reviewed ? new Date(Date.now() - 60_000) : null,
      publishedAt: status === 'published' ? new Date(Date.now() - 60_000) : null,
      translations: { create: translations },
    },
  });
}

export interface ProviderSpec {
  nameAr?: string;
  nameEn?: string;
  type?:
    'service_center' | 'dealer' | 'charger_installer' | 'emergency' | 'battery_service' | 'other';
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  verified?: boolean;
  sponsored?: boolean;
  status?: 'draft' | 'published';
  marketCode?: string;
  isAlwaysOpen?: boolean | null;
  openingHours?: Record<string, [string, string][]> | null;
}

/** Service provider written directly (fictional contact data). */
export async function createProvider(t: TestApp, spec: ProviderSpec = {}) {
  const n = uid();
  return t.prisma.serviceProvider.create({
    data: {
      slug: `e2e-provider-${n}`,
      type: spec.type ?? 'service_center',
      nameAr: spec.nameAr ?? `مركز اختبار ${n}`,
      nameEn: spec.nameEn ?? `Test centre ${n}`,
      marketCode: spec.marketCode ?? 'EG',
      city: spec.city === undefined ? 'Test City' : spec.city,
      latitude: spec.lat ?? null,
      longitude: spec.lng ?? null,
      phone: '+20 100 000 0000',
      contactVerifiedAt: spec.verified ? new Date(Date.now() - 86_400_000) : null,
      isSponsored: spec.sponsored ?? false,
      sponsorLabel: spec.sponsored ? 'Sponsored (test)' : null,
      status: spec.status ?? 'published',
      isAlwaysOpen: spec.isAlwaysOpen ?? null,
      openingHours: spec.openingHours ?? undefined,
    },
  });
}
