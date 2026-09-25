import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { tr } from '../../../common/validation/messages';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ACCESS_TYPES,
  AMENITIES,
  CHECKIN_OUTCOMES,
  dictionary,
  NOT_AVAILABLE,
  OPERATIONAL_STATUSES,
  PAYMENT_METHODS,
  REPORT_TYPES,
  START_METHODS,
} from '../common/labels';
import { pick } from '../common/values';
import type { StationsMetaDto } from '../dto/public.dto';
import { StationAvailabilityService } from './station-availability.service';

const CACHE_MS = 60_000;

/** Reference data for the app's filter / report / check-in screens. */
@Injectable()
export class StationMetaService {
  private cache = new Map<SupportedLanguage, { at: number; body: StationsMetaDto }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: StationAvailabilityService,
  ) {}

  async meta(lang: SupportedLanguage): Promise<StationsMetaDto> {
    const hit = this.cache.get(lang);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.body;
    const [types, reasons] = await Promise.all([
      this.prisma.connectorType.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      }),
      this.prisma.reportReason.findMany({
        where: { scope: 'station', isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      }),
    ]);
    const reportTypes =
      reasons.length > 0
        ? reasons.map((r) => ({
            code: r.code,
            label: lang === 'en' ? r.labelEn : r.labelAr,
            help: pick(lang, r.descriptionAr, r.descriptionEn),
            requiresDetails: r.requiresDetails,
          }))
        : Object.keys(REPORT_TYPES).map((code) => ({
            code,
            label: REPORT_TYPES[code][lang],
            help: null,
            requiresDetails: code === 'other',
          }));
    const body: StationsMetaDto = {
      connectorTypes: types.map((t) => ({
        code: t.code,
        name: lang === 'en' ? t.nameEn : t.nameAr,
        nameAr: t.nameAr,
        nameEn: t.nameEn,
        supportsAc: t.supportsAc,
        supportsDc: t.supportsDc,
        iconKey: t.iconKey,
        standard: t.standard,
      })),
      amenities: dictionary(AMENITIES, lang),
      paymentMethods: dictionary(PAYMENT_METHODS, lang),
      startMethods: dictionary(START_METHODS, lang),
      accessTypes: dictionary(ACCESS_TYPES, lang),
      operationalStatuses: dictionary(OPERATIONAL_STATUSES, lang),
      checkinOutcomes: dictionary(CHECKIN_OUTCOMES, lang),
      reportTypes,
      liveAvailability: this.availability.providerInfo(),
      notAvailableLabel: tr(NOT_AVAILABLE, lang),
    };
    this.cache.set(lang, { at: Date.now(), body });
    return body;
  }

  /** Report reason of a type (null when the table has none, e.g. an old database). */
  async reportReason(code: string): Promise<{ requiresDetails: boolean; isActive: boolean } | null> {
    return this.prisma.reportReason.findUnique({
      where: { scope_code: { scope: 'station', code } },
      select: { requiresDetails: true, isActive: true },
    });
  }
}
