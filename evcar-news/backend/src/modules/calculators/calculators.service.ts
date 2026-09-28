import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../config/app-config';
import { fieldError, fieldErrors } from '../garage/common/personal-errors';
import type {
  ChargeCostDto,
  ChargeTimeDto,
  CostPer100kmDto,
  MonthlyCostDto,
  TcoDto,
  VsFuelDto,
} from './dto/calculators.dto';
import {
  CalcInputError,
  type CalcOutput,
  chargeCost,
  chargeTime,
  costPer100km,
  monthlyCost,
  type ProvenanceMap,
  tco,
  vsFuel,
} from './engine';
import { EnergyPricesService, type ReferencePriceRow } from './energy-prices.service';
import { type VehicleData, VehicleDataService } from './vehicle-data.service';

export type CalculatorResponse = CalcOutput<unknown> & {
  vehicle: { variantId: string; marketCode: string; name: string } | null;
};

interface Ctx {
  market: string;
  lang: SupportedLanguage;
  userId?: string;
}

type RefKey = 'electricityPricePerKwh' | 'publicPricePerKwh' | 'fuelPricePerLiter' | 'energyPerKwh';

/** Where each reference price goes in the engine input, and its unit. */
const REF_TARGETS: Record<RefKey, { unit: 'per_kwh' | 'per_liter' }> = {
  electricityPricePerKwh: { unit: 'per_kwh' },
  publicPricePerKwh: { unit: 'per_kwh' },
  fuelPricePerLiter: { unit: 'per_liter' },
  energyPerKwh: { unit: 'per_kwh' },
};

const isSet = (v: unknown) => v !== undefined && v !== null;

/**
 * Glue between the HTTP layer and the pure engine: fills missing values
 * from the catalog (trim or garage car) and from admin reference prices the
 * client picked — each with a visible provenance note — then runs the
 * engine and maps its input errors to 422 VALIDATION_FAILED.
 */
@Injectable()
export class CalculatorsService {
  constructor(
    private readonly vehicles: VehicleDataService,
    private readonly prices: EnergyPricesService,
  ) {}

  private run<R>(
    fn: () => CalcOutput<R>,
    vehicle: VehicleData | null,
    extraWarnings: { code: string; message: string }[],
  ): CalculatorResponse {
    let out: CalcOutput<R>;
    try {
      out = fn();
    } catch (err) {
      if (err instanceof CalcInputError) throw fieldErrors(err.problems);
      throw err;
    }
    for (const w of extraWarnings)
      if (!out.warnings.some((x) => x.code === w.code)) out.warnings.push(w);
    return {
      ...(out as CalcOutput<unknown>),
      vehicle: vehicle
        ? {
            variantId: vehicle.variantId,
            marketCode: vehicle.marketCode,
            name: vehicle.vehicleName,
          }
        : null,
    };
  }

  private async vehicle(dto: { variantId?: string; userVehicleId?: string }, ctx: Ctx) {
    if (dto.variantId && dto.userVehicleId) {
      throw fieldError('userVehicleId', 'oneOf', {
        ar: 'اختر سيارة واحدة: من الدليل أو من جراجك.',
        en: 'Choose one car: a catalog trim or a garage car.',
      });
    }
    return this.vehicles.resolve(dto, ctx.market, ctx.userId, ctx.lang);
  }

  /**
   * Applies reference prices: sets the amounts, currency and (when not
   * given) the price date = the oldest effective date used.
   */
  private async applyReferencePrices(
    dto: {
      referencePriceIds?: Partial<Record<RefKey, string>>;
      currency?: string;
      priceDate?: string;
    },
    given: Partial<Record<RefKey, unknown>>,
    ctx: Ctx,
  ): Promise<{
    values: Partial<Record<RefKey, number>>;
    currency?: string;
    priceDate?: string;
    prov: ProvenanceMap;
    warnings: { code: string; message: string }[];
  }> {
    const ids = dto.referencePriceIds ?? {};
    const keys = (Object.keys(ids) as RefKey[]).filter((k) => ids[k]);
    const out = {
      values: {} as Partial<Record<RefKey, number>>,
      currency: dto.currency,
      priceDate: dto.priceDate,
      prov: {} as ProvenanceMap,
      warnings: [] as { code: string; message: string }[],
    };
    if (!keys.length) return out;
    const rows = await this.prices.findByIds(keys.map((k) => ids[k]!));
    const used: ReferencePriceRow[] = [];
    for (const key of keys) {
      const field = `referencePriceIds.${key}`;
      if (isSet(given[key])) {
        throw fieldError(field, 'oneOf', {
          ar: 'أدخل السعر يدويًا أو اختر سعرًا مرجعيًا، لا الاثنين.',
          en: 'Enter the price or pick a reference price, not both.',
        });
      }
      const row = rows.get(ids[key]!);
      if (!row) {
        throw fieldError(field, 'exists', {
          ar: 'السعر المرجعي غير موجود.',
          en: 'Reference price not found.',
        });
      }
      if (row.unit !== REF_TARGETS[key].unit) {
        throw fieldError(field, 'unit', {
          ar: 'وحدة السعر المرجعي لا تناسب هذا الحقل.',
          en: 'The reference price unit does not fit this field.',
        });
      }
      if (out.currency && out.currency !== row.currencyCode) {
        throw fieldError(field, 'currency', {
          ar: 'عملة السعر المرجعي تختلف عن عملة الحساب.',
          en: 'The reference price currency differs from the calculation currency.',
        });
      }
      out.currency = row.currencyCode;
      out.values[key] = Number(row.price.toString());
      used.push(row);
      const view = this.prices.present(row, ctx.lang);
      const provKey = key === 'energyPerKwh' ? 'tariff.energyPerKwh' : key;
      out.prov[provKey] = {
        origin: 'reference_price',
        note: [
          ctx.lang === 'ar' ? 'سعر مرجعي' : 'Reference price',
          view.source?.title ?? null,
          `${ctx.lang === 'ar' ? 'ساري من' : 'effective from'} ${view.effectiveFrom}`,
          view.isDemo ? 'DEMO' : null,
        ]
          .filter(Boolean)
          .join(' · '),
      };
      if (key === 'fuelPricePerLiter') out.prov['fuelCar.fuelPricePerLiter'] = out.prov[provKey];
      if (view.possiblyOutdated) {
        out.warnings.push({
          code: 'REFERENCE_PRICE_OLD',
          message:
            ctx.lang === 'ar'
              ? `السعر المرجعي ساري منذ ${view.effectiveFrom} وقد يكون قديمًا؛ عدّله إن تغيّر.`
              : `The reference price is effective since ${view.effectiveFrom} and may be outdated; edit it if it changed.`,
        });
      }
    }
    if (!out.priceDate) {
      out.priceDate = used.map((r) => r.effectiveFrom.toISOString().slice(0, 10)).sort()[0];
      out.prov.priceDate = { origin: 'reference_price' };
    }
    return out;
  }

  // ---- calculators ------------------------------------------------------------------------

  async chargeCost(dto: ChargeCostDto, ctx: Ctx): Promise<CalculatorResponse> {
    const v = await this.vehicle(dto, ctx);
    const prov: ProvenanceMap = {};
    let usable = dto.batteryUsableKwh;
    if (!isSet(usable) && !isSet(dto.energyKwh) && v?.batteryUsableKwh) {
      usable = v.batteryUsableKwh.value;
      prov.batteryUsableKwh = { origin: 'catalog', note: v.batteryUsableKwh.note };
    }
    const ref = await this.applyReferencePrices(
      dto,
      { energyPerKwh: dto.tariff?.energyPerKwh },
      ctx,
    );
    Object.assign(prov, ref.prov);
    const tariff = { ...(dto.tariff ?? {}) };
    if (ref.values.energyPerKwh !== undefined) tariff.energyPerKwh = ref.values.energyPerKwh;
    return this.run(
      () =>
        chargeCost(
          {
            ...dto,
            batteryUsableKwh: usable,
            tariff: dto.tariff || ref.values.energyPerKwh !== undefined ? tariff : undefined,
            currency: ref.currency,
            priceDate: ref.priceDate,
          },
          ctx.lang,
          prov,
        ),
      v,
      ref.warnings,
    );
  }

  async chargeTime(dto: ChargeTimeDto, ctx: Ctx): Promise<CalculatorResponse> {
    const v = await this.vehicle(dto, ctx);
    const prov: ProvenanceMap = {};
    const input = { ...dto };
    if (v) {
      if (!isSet(input.batteryUsableKwh) && v.batteryUsableKwh) {
        input.batteryUsableKwh = v.batteryUsableKwh.value;
        prov.batteryUsableKwh = { origin: 'catalog', note: v.batteryUsableKwh.note };
      }
      if (dto.currentType === 'AC' && !isSet(input.vehicleAcMaxKw) && v.acMaxKw) {
        input.vehicleAcMaxKw = v.acMaxKw.value;
        prov.vehicleAcMaxKw = { origin: 'catalog', note: v.acMaxKw.note };
      }
      if (dto.currentType === 'DC') {
        if (!isSet(input.vehicleDcPeakKw) && v.dcPeakKw) {
          input.vehicleDcPeakKw = v.dcPeakKw.value;
          prov.vehicleDcPeakKw = { origin: 'catalog', note: v.dcPeakKw.note };
        }
        if (!isSet(input.curve) && v.dcCurve) {
          input.curve = v.dcCurve.value;
          prov.curve = { origin: 'catalog', note: v.dcCurve.note };
        }
      }
    }
    return this.run(() => chargeTime(input, ctx.lang, prov), v, []);
  }

  private async electric<T extends CostPer100kmDto>(dto: T, ctx: Ctx, fuelGiven?: unknown) {
    const v = await this.vehicle(dto, ctx);
    const prov: ProvenanceMap = {};
    const input = { ...dto } as T & Record<string, unknown>;
    if (!isSet(dto.consumptionKwhPer100km) && !isSet(dto.consumptionWhPerKm) && v?.consumption) {
      input.consumptionKwhPer100km = v.consumption.value;
      input.consumptionBasis = 'grid';
      prov.consumptionKwhPer100km = { origin: 'catalog', note: v.consumption.note };
      prov.consumptionBasis = { origin: 'catalog' };
    }
    const ref = await this.applyReferencePrices(
      dto,
      {
        electricityPricePerKwh: dto.electricityPricePerKwh,
        publicPricePerKwh: dto.publicPricePerKwh,
        fuelPricePerLiter: fuelGiven,
      },
      ctx,
    );
    Object.assign(prov, ref.prov);
    if (ref.values.electricityPricePerKwh !== undefined)
      input.electricityPricePerKwh = ref.values.electricityPricePerKwh;
    if (ref.values.publicPricePerKwh !== undefined)
      input.publicPricePerKwh = ref.values.publicPricePerKwh;
    input.currency = ref.currency;
    input.priceDate = ref.priceDate;
    return { v, input, prov, ref };
  }

  async costPer100km(dto: CostPer100kmDto, ctx: Ctx): Promise<CalculatorResponse> {
    const { v, input, prov, ref } = await this.electric(dto, ctx);
    return this.run(() => costPer100km(input, ctx.lang, prov), v, ref.warnings);
  }

  async monthlyCost(dto: MonthlyCostDto, ctx: Ctx): Promise<CalculatorResponse> {
    const { v, input, prov, ref } = await this.electric(dto, ctx);
    return this.run(() => monthlyCost(input, ctx.lang, prov), v, ref.warnings);
  }

  async vsFuel(dto: VsFuelDto, ctx: Ctx): Promise<CalculatorResponse> {
    const { v, input, prov, ref } = await this.electric(dto, ctx, dto.fuelPricePerLiter);
    if (ref.values.fuelPricePerLiter !== undefined)
      input.fuelPricePerLiter = ref.values.fuelPricePerLiter;
    return this.run(() => vsFuel(input, ctx.lang, prov), v, ref.warnings);
  }

  async tco(dto: TcoDto, ctx: Ctx): Promise<CalculatorResponse> {
    const { v, input, prov, ref } = await this.electric(dto, ctx, dto.fuelCar?.fuelPricePerLiter);
    if (ref.values.fuelPricePerLiter !== undefined) {
      input.fuelCar = { ...(dto.fuelCar ?? {}), fuelPricePerLiter: ref.values.fuelPricePerLiter };
    }
    return this.run(() => tco(input, ctx.lang, prov), v, ref.warnings);
  }
}
