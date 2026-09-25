import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { tr } from '../../../common/validation/messages';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  type InletLike,
  inletPairs,
  isUsableInlet,
  USABLE_INLET_RELIABILITIES,
} from '../common/compatibility';
import { COMPATIBILITY_NOTE } from '../common/labels';
import { StationErrors } from '../common/station-errors';
import { num, pick } from '../common/values';

export interface VehicleRef {
  vehicleVariantId?: string;
  userVehicleId?: string;
}

export interface VehicleCompatibilityView {
  variantId: string;
  marketCode: string;
  vehicleName: string;
  inlets: {
    connectorType: { code: string; name: string };
    currentType: 'AC' | 'DC';
    maxPowerKw: number | null;
    reliability: string;
  }[];
  /** Inlets not used because their data is not verified. */
  ignoredInlets: number;
  usableReliabilities: string[];
  note: string;
}

export interface ResolvedVehicle {
  view: VehicleCompatibilityView;
  inlets: InletLike[];
  pairs: { code: string; current: 'AC' | 'DC' }[];
}

/**
 * Resolves "my vehicle" for station compatibility (REQUIREMENTS §11): a
 * public catalog trim in the request market, or a car of the caller's
 * garage (its own market). Only verified / manufacturer-claimed inlet data
 * of that trim IN that market is used; without it the filter is refused
 * (422 VEHICLE_COMPATIBILITY_UNKNOWN) instead of guessing.
 */
@Injectable()
export class VehicleCompatService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    ref: VehicleRef,
    market: string,
    userId: string | undefined,
    lang: SupportedLanguage,
  ): Promise<ResolvedVehicle | null> {
    let variantId: string;
    let marketCode = market;
    if (ref.userVehicleId) {
      if (!userId) throw StationErrors.signInForGarage();
      const uv = await this.prisma.userVehicle.findFirst({
        where: { id: ref.userVehicleId, userId },
        select: { variantId: true, marketCode: true },
      });
      if (!uv) throw StationErrors.vehicleNotFound('userVehicleId');
      variantId = uv.variantId;
      marketCode = uv.marketCode;
    } else if (ref.vehicleVariantId) {
      variantId = ref.vehicleVariantId;
    } else {
      return null;
    }

    const variant = await this.prisma.vehicleVariant.findFirst({
      where: {
        id: variantId,
        deletedAt: null,
        // A garage car may point at a trim that is no longer listed; the
        // public filter only accepts published trims.
        ...(ref.userVehicleId ? {} : { status: 'published' }),
      },
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
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
      },
    });
    if (!variant) {
      throw StationErrors.vehicleNotFound(ref.userVehicleId ? 'userVehicleId' : 'vehicleVariantId');
    }
    const model = variant.modelYear.generation.model;
    const vehicleName = [
      pick(lang, model.brand.nameAr, model.brand.nameEn),
      pick(lang, model.nameAr, model.nameEn),
      String(variant.modelYear.year),
      pick(lang, variant.nameAr, variant.nameEn),
    ]
      .filter(Boolean)
      .join(' ');

    const vm = await this.prisma.variantMarket.findUnique({
      where: { variantId_marketCode: { variantId, marketCode } },
      select: {
        inlets: {
          select: {
            connectorTypeCode: true,
            currentType: true,
            maxPowerKw: true,
            reliability: true,
            connectorType: { select: { nameAr: true, nameEn: true } },
          },
          orderBy: [{ currentType: 'asc' }, { connectorTypeCode: 'asc' }],
        },
      },
    });
    if (!vm) {
      throw StationErrors.vehicleCompatibilityUnknown({
        reason: 'variant_not_in_market',
        variantId,
        marketCode,
      });
    }
    const all = vm.inlets.map((i) => ({
      connectorTypeCode: i.connectorTypeCode,
      currentType: i.currentType,
      maxPowerKw: num(i.maxPowerKw),
      reliability: i.reliability,
      name: pick(lang, i.connectorType.nameAr, i.connectorType.nameEn) ?? i.connectorTypeCode,
    }));
    const usable = all.filter(isUsableInlet);
    if (usable.length === 0) {
      throw StationErrors.vehicleCompatibilityUnknown({
        reason: 'no_verified_inlets',
        variantId,
        marketCode,
      });
    }
    return {
      view: {
        variantId,
        marketCode,
        vehicleName,
        inlets: usable.map((i) => ({
          connectorType: { code: i.connectorTypeCode, name: i.name },
          currentType: i.currentType,
          maxPowerKw: i.maxPowerKw,
          reliability: i.reliability,
        })),
        ignoredInlets: all.length - usable.length,
        usableReliabilities: [...USABLE_INLET_RELIABILITIES],
        note: tr(COMPATIBILITY_NOTE, lang),
      },
      inlets: usable,
      pairs: inletPairs(usable),
    };
  }
}
