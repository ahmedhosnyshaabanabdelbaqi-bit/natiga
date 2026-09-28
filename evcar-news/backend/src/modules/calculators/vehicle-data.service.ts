import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../config/app-config';
import { PrismaService } from '../../prisma/prisma.service';
import { isUsableInlet } from '../stations/common/compatibility';
import { num, pick } from '../stations/common/values';
import { VEHICLE_NOT_FOUND, fieldError } from '../garage/common/personal-errors';

/** A catalog value with the provenance shown next to it. */
export interface Sourced<T> {
  value: T;
  reliability: string;
  /** "Catalog · <source> · <reliability> · verified <date>" (request language). */
  note: string;
}

export interface CatalogCurvePoint {
  socPercent: number;
  powerKw: number;
}

export interface VehicleData {
  variantId: string;
  marketCode: string;
  vehicleName: string;
  powertrainType: string;
  batteryUsableKwh: Sourced<number> | null;
  acMaxKw: Sourced<number> | null;
  dcPeakKw: Sourced<number> | null;
  dcCurve: (Sourced<CatalogCurvePoint[]> & { chargerMaxPowerKw: number | null }) | null;
  /** Electricity consumption (kWh/100 km, grid side) with its test cycle, never converted. */
  consumption: (Sourced<number> & { cycle: string }) | null;
  /** Usable (verified / manufacturer-claim) inlets of the trim in the market. */
  inlets: {
    connectorTypeCode: string;
    currentType: 'AC' | 'DC';
    maxPowerKw: number | null;
    reliability: string;
  }[];
}

export interface VehicleRefInput {
  variantId?: string | null;
  userVehicleId?: string | null;
}

/** Best first. Disputed values are never used. */
const RELIABILITY_ORDER = ['verified', 'manufacturer_claim', 'estimated', 'unverified'] as const;
const CYCLE_ORDER = ['WLTP', 'EPA', 'CLTC', 'NEDC', 'OTHER'] as const;

const rank = (r: string) => {
  const i = (RELIABILITY_ORDER as readonly string[]).indexOf(r);
  return i < 0 ? 99 : i;
};

const RELIABILITY_LABEL: Record<string, { ar: string; en: string }> = {
  verified: { ar: 'موثّق', en: 'verified' },
  manufacturer_claim: { ar: 'بيان الشركة المصنعة', en: 'manufacturer claim' },
  estimated: { ar: 'تقديري', en: 'estimated' },
  unverified: { ar: 'غير موثّق', en: 'unverified' },
};

/**
 * Reads the catalog values the calculators and the trip planner may use for
 * a trim (public, published) or a car of the caller's garage: usable
 * battery, AC / DC limits, a documented DC curve, consumption (with its
 * cycle) and verified inlets. Market-specific values win over global ones;
 * `disputed` values are ignored; every value carries its source note so the
 * apps can show where it came from. Missing values are null — never guessed.
 */
@Injectable()
export class VehicleDataService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    ref: VehicleRefInput,
    market: string,
    userId: string | undefined,
    lang: SupportedLanguage,
  ): Promise<VehicleData | null> {
    let variantId: string;
    let marketCode = market;
    if (ref.userVehicleId) {
      if (!userId) {
        throw fieldError('userVehicleId', 'signIn', {
          ar: 'سجّل الدخول لاستخدام سيارة من جراجك.',
          en: 'Sign in to use a car from your garage.',
        });
      }
      const uv = await this.prisma.userVehicle.findFirst({
        where: { id: ref.userVehicleId, userId },
        select: { variantId: true, marketCode: true },
      });
      if (!uv) throw VEHICLE_NOT_FOUND('userVehicleId');
      variantId = uv.variantId;
      marketCode = uv.marketCode;
    } else if (ref.variantId) {
      variantId = ref.variantId;
    } else {
      return null;
    }

    const v = await this.prisma.vehicleVariant.findFirst({
      where: {
        id: variantId,
        deletedAt: null,
        ...(ref.userVehicleId ? {} : { status: 'published' }),
      },
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        powertrainType: true,
        modelYear: {
          select: {
            year: true,
            generation: {
              select: {
                model: {
                  select: {
                    nameAr: true,
                    nameEn: true,
                    brand: { select: { nameAr: true, nameEn: true } },
                  },
                },
              },
            },
          },
        },
        specifications: {
          where: {
            specKey: { in: ['battery.usable_kwh', 'charging.ac_max_kw', 'charging.dc_peak_kw'] },
            OR: [{ marketCode: null }, { marketCode }],
            reliability: { not: 'disputed' },
            valueNum: { not: null },
          },
          select: {
            specKey: true,
            marketCode: true,
            valueNum: true,
            reliability: true,
            verifiedAt: true,
            source: { select: { title: true } },
          },
        },
        consumptionMeasurements: {
          where: {
            kind: 'electricity',
            OR: [{ marketCode: null }, { marketCode }],
            reliability: { not: 'disputed' },
          },
          select: {
            cycle: true,
            mode: true,
            marketCode: true,
            value: true,
            reliability: true,
            verifiedAt: true,
            source: { select: { title: true } },
          },
        },
        chargingCurves: {
          where: { currentType: 'DC', reliability: { not: 'disputed' } },
          select: {
            reliability: true,
            verifiedAt: true,
            chargerMaxPowerKw: true,
            source: { select: { title: true } },
            points: { select: { socPercent: true, powerKw: true }, orderBy: { socPercent: 'asc' } },
          },
        },
        markets: {
          where: { marketCode },
          select: {
            inlets: {
              select: {
                connectorTypeCode: true,
                currentType: true,
                maxPowerKw: true,
                reliability: true,
              },
            },
          },
        },
      },
    });
    if (!v) throw VEHICLE_NOT_FOUND(ref.userVehicleId ? 'userVehicleId' : 'variantId');

    const model = v.modelYear.generation.model;
    const vehicleName = [
      pick(lang, model.brand.nameAr, model.brand.nameEn),
      pick(lang, model.nameAr, model.nameEn),
      String(v.modelYear.year),
      pick(lang, v.nameAr, v.nameEn),
    ]
      .filter(Boolean)
      .join(' ');

    const note = (
      source: string | null | undefined,
      reliability: string,
      verifiedAt: Date | null,
      extra?: string,
    ) => {
      const label = RELIABILITY_LABEL[reliability] ?? { ar: reliability, en: reliability };
      const parts = [
        lang === 'ar' ? 'من دليل السيارات' : 'From the car catalog',
        source ?? null,
        label[lang],
        verifiedAt
          ? `${lang === 'ar' ? 'تاريخ التحقق' : 'verified'} ${verifiedAt.toISOString().slice(0, 10)}`
          : null,
        extra ?? null,
      ];
      return parts.filter(Boolean).join(' · ');
    };

    const bestSpec = (key: string): Sourced<number> | null => {
      const rows = v.specifications
        .filter((s) => s.specKey === key)
        .sort(
          (a, b) =>
            Number(b.marketCode !== null) - Number(a.marketCode !== null) ||
            rank(a.reliability) - rank(b.reliability),
        );
      const s = rows[0];
      const value = s ? num(s.valueNum) : null;
      if (!s || value === null || !(value > 0)) return null;
      return {
        value,
        reliability: s.reliability,
        note: note(s.source?.title, s.reliability, s.verifiedAt),
      };
    };

    const inlets = (v.markets[0]?.inlets ?? [])
      .map((i) => ({
        connectorTypeCode: i.connectorTypeCode,
        currentType: i.currentType,
        maxPowerKw: num(i.maxPowerKw),
        reliability: i.reliability,
      }))
      .filter(isUsableInlet);

    const fromInlet = (current: 'AC' | 'DC'): Sourced<number> | null => {
      const best = inlets
        .filter((i) => i.currentType === current && i.maxPowerKw !== null && i.maxPowerKw > 0)
        .sort(
          (a, b) => rank(a.reliability) - rank(b.reliability) || b.maxPowerKw! - a.maxPowerKw!,
        )[0];
      if (!best) return null;
      return {
        value: best.maxPowerKw!,
        reliability: best.reliability,
        note: note(null, best.reliability, null, `${current} ${best.connectorTypeCode}`),
      };
    };

    const consumption = v.consumptionMeasurements
      .filter((c) => c.mode === null || c.mode === 'combined' || c.mode === 'charge_depleting')
      .sort(
        (a, b) =>
          CYCLE_ORDER.indexOf(a.cycle) - CYCLE_ORDER.indexOf(b.cycle) ||
          Number(b.marketCode !== null) - Number(a.marketCode !== null) ||
          rank(a.reliability) - rank(b.reliability),
      )[0];
    const consumptionWhKm = consumption ? num(consumption.value) : null;

    const curve = v.chargingCurves
      .filter((c) => c.points.length >= 2)
      .sort(
        (a, b) => rank(a.reliability) - rank(b.reliability) || b.points.length - a.points.length,
      )[0];

    return {
      variantId: v.id,
      marketCode,
      vehicleName,
      powertrainType: v.powertrainType,
      batteryUsableKwh: bestSpec('battery.usable_kwh'),
      acMaxKw: bestSpec('charging.ac_max_kw') ?? fromInlet('AC'),
      dcPeakKw: bestSpec('charging.dc_peak_kw') ?? fromInlet('DC'),
      dcCurve: curve
        ? {
            value: curve.points.map((p) => ({
              socPercent: num(p.socPercent)!,
              powerKw: num(p.powerKw)!,
            })),
            reliability: curve.reliability,
            chargerMaxPowerKw: num(curve.chargerMaxPowerKw),
            note: note(curve.source?.title, curve.reliability, curve.verifiedAt),
          }
        : null,
      consumption:
        consumption && consumptionWhKm !== null && consumptionWhKm > 0
          ? {
              value: consumptionWhKm / 10,
              cycle: consumption.cycle,
              reliability: consumption.reliability,
              note: note(
                consumption.source?.title,
                consumption.reliability,
                consumption.verifiedAt,
                lang === 'ar'
                  ? `دورة ${consumption.cycle} (دون تحويل)`
                  : `${consumption.cycle} cycle (not converted)`,
              ),
            }
          : null,
      inlets,
    };
  }
}
