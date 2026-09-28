import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import { toPageRequest } from '../../common/http/pagination';
import { paginated, type PaginatedResponse } from '../../common/http/responses';
import { Decimal } from '../../common/money/money';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ROUTING_PROVIDER, type RouteResult, type RoutingProvider } from '../../providers';
import { VehicleDataService, type VehicleData } from '../calculators/vehicle-data.service';
import { appError, fieldError, notFound } from '../garage/common/personal-errors';
import { connectorAvailability } from '../stations/common/availability';
import { connectorCompatibility, type InletLike } from '../stations/common/compatibility';
import { evaluateOpenNow, type OpeningHours } from '../stations/common/opening-hours';
import { pick } from '../stations/common/values';
import { cumulativeKm, projectOnLine, simplify } from './planner/geo';
import { planStops, type PlannedStop, type PlannerCandidate } from './planner/plan';
import type { ListTripsQueryDto, PlanTripDto } from './trips.dto';

export const TRIP_DEFAULTS = {
  consumptionMarginPercent: 10,
  chargeToSocPercent: 80,
  corridorKm: 10,
  efficiency: 0.9,
} as const;

const EXCLUDED_CONNECTOR_STATUS = new Set([
  'permanently_closed',
  'planned',
  'temporarily_unavailable',
]);

interface StationRow {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  latitude: number;
  longitude: number;
  address_line: string | null;
  address_ar: string | null;
  address_en: string | null;
  city: string | null;
  opening_hours: unknown;
  is_always_open: boolean | null;
  opening_hours_text: string | null;
  timezone: string;
  operational_status: string;
  access_type: string;
  access_restrictions: string | null;
}

interface Candidate extends PlannerCandidate {
  row: StationRow;
  connectorId: string;
}

type Lang = SupportedLanguage;
const t = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Trip planner (REQUIREMENTS §12). Only works with a configured routing
 * provider (road distances, never straight lines); otherwise 503
 * INTEGRATION_NOT_CONFIGURED and app-config hides the feature. Plans are
 * estimates with visible assumptions: stations reachable with the reserve,
 * an alternative per stop, compatibility from verified inlet data, access,
 * opening hours at the expected arrival, and how much the station status
 * can be trusted. When the data does not support a plan, it is refused.
 * Plans are stored only when the signed-in user asks (`save: true`).
 */
@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicles: VehicleDataService,
    @Inject(ROUTING_PROVIDER) private readonly routing: RoutingProvider,
  ) {}

  private static refuse(code: string, message: { ar: string; en: string }, details?: unknown) {
    return appError(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
  }

  async plan(dto: PlanTripDto, userId: string | undefined, market: string, lang: Lang) {
    if (!this.routing.configured) {
      throw AppException.integrationNotConfigured(`routing.${this.routing.name}`, {
        ar: 'تخطيط الرحلات غير متاح: لم يُهيّأ مزود المسارات.',
        en: 'Trip planning is unavailable: no routing provider is configured.',
      });
    }
    if (dto.save && !userId) {
      throw fieldError('save', 'signIn', {
        ar: 'سجّل الدخول لحفظ الرحلة.',
        en: 'Sign in to save the trip.',
      });
    }
    if (!!dto.userVehicleId === !!dto.variantId) {
      throw fieldError('variantId', 'oneOf', {
        ar: 'اختر سيارة واحدة: من جراجك أو من الدليل.',
        en: 'Choose one car: from your garage or from the catalog.',
      });
    }
    if (dto.currentSocPercent <= dto.minArrivalSocPercent) {
      throw fieldError('currentSocPercent', 'aboveReserve', {
        ar: 'نسبة البطارية الحالية يجب أن تكون أعلى من الحد الأدنى عند الوصول.',
        en: 'The current battery level must be above the minimum arrival level.',
      });
    }
    const a = dto.assumptions ?? {};
    const chargeTo = a.chargeToSocPercent ?? TRIP_DEFAULTS.chargeToSocPercent;
    if (chargeTo <= dto.minArrivalSocPercent + 5) {
      throw fieldError('assumptions.chargeToSocPercent', 'aboveReserve', {
        ar: 'حد الشحن عند التوقف منخفض جدًا مقارنة بالحد الأدنى عند الوصول.',
        en: 'The charge-to level is too close to the minimum arrival level.',
      });
    }
    if (a.electricityPricePerKwh !== undefined && !a.currency) {
      throw fieldError('assumptions.currency', 'required', {
        ar: 'أدخل العملة مع السعر.',
        en: 'Enter the currency with the price.',
      });
    }

    // --- vehicle ------------------------------------------------------------------------------
    const v = (await this.vehicles.resolve(dto, market, userId, lang))!;
    const usable = a.batteryUsableKwh ?? v.batteryUsableKwh?.value ?? null;
    const consumption = a.consumptionKwhPer100km ?? v.consumption?.value ?? null;
    const missing = [
      ...(usable === null ? ['batteryUsableKwh'] : []),
      ...(consumption === null ? ['consumptionKwhPer100km'] : []),
    ];
    if (missing.length) {
      throw TripsService.refuse(
        'TRIP_VEHICLE_DATA_MISSING',
        {
          ar: 'لا تتوفر بيانات كافية عن السيارة لتخطيط الرحلة؛ أدخلها في الافتراضات.',
          en: 'Not enough car data to plan the trip; enter it in the assumptions.',
        },
        { missing },
      );
    }
    const efficiency = a.efficiency ?? TRIP_DEFAULTS.efficiency;
    const margin = a.consumptionMarginPercent ?? TRIP_DEFAULTS.consumptionMarginPercent;
    const corridorKm = a.corridorKm ?? TRIP_DEFAULTS.corridorKm;
    const departureAt = dto.departureAt ? new Date(dto.departureAt) : new Date();

    // --- route ---------------------------------------------------------------------------------
    const route = await this.routing.route({
      waypoints: [
        { lat: dto.origin.lat, lng: dto.origin.lng },
        { lat: dto.destination.lat, lng: dto.destination.lng },
      ],
      language: lang,
    });
    const routeKm = route.distanceMeters / 1000;
    const routeMinutes = route.durationSeconds / 60;

    // --- candidates ---------------------------------------------------------------------------
    const kwhPerKm = (consumption! * (1 + margin / 100)) / 100;
    const needsStops =
      routeKm * kwhPerKm > ((dto.currentSocPercent - dto.minArrivalSocPercent) / 100) * usable!;
    let candidates: Candidate[] = [];
    if (needsStops) {
      if (!v.inlets.length) {
        throw TripsService.refuse(
          'TRIP_VEHICLE_DATA_MISSING',
          {
            ar: 'لا تتوفر بيانات موثّقة عن منافذ شحن السيارة في هذا السوق؛ لا يمكن اقتراح محطات متوافقة.',
            en: 'No verified charging-inlet data for this car in this market; compatible stations cannot be suggested.',
          },
          { missing: ['inlets'] },
        );
      }
      candidates = await this.candidates(route, routeKm, corridorKm, v.inlets);
    }

    const result = planStops({
      routeKm,
      routeMinutes,
      departureAt,
      vehicle: {
        usableKwh: usable!,
        efficiency,
        acMaxKw: v.acMaxKw?.value ?? null,
        dcPeakKw: v.dcPeakKw?.value ?? null,
        dcCurve: v.dcCurve?.value ?? null,
        hasDc: v.inlets.some((i) => i.currentType === 'DC'),
      },
      consumptionKwhPer100km: consumption!,
      consumptionMarginPercent: margin,
      startSoc: dto.currentSocPercent,
      reserveSoc: dto.minArrivalSocPercent,
      chargeToSoc: chargeTo,
      candidates,
    });
    if (!result.feasible) {
      throw TripsService.refuse(
        'TRIP_NO_REACHABLE_STATION',
        {
          ar: 'لا توجد محطة متوافقة يمكن الوصول إليها مع الاحتفاظ بالحد الأدنى للبطارية؛ لن نقترح خطة غير مضمونة البيانات.',
          en: 'No compatible station can be reached while keeping the minimum battery level; no plan is suggested.',
        },
        {
          reason: result.reason,
          atKm: result.atKm,
          rangeKm: result.rangeKm,
          stationsConsidered: candidates.length,
        },
      );
    }

    // --- real road legs through the chosen stops ---------------------------------------------
    const stops = result.stops;
    const legsRoute = stops.length
      ? await this.routing.route({
          waypoints: [
            { lat: dto.origin.lat, lng: dto.origin.lng },
            ...stops.map((s) => ({
              lat: (s.candidate as Candidate).row.latitude,
              lng: (s.candidate as Candidate).row.longitude,
            })),
            { lat: dto.destination.lat, lng: dto.destination.lng },
          ],
          language: lang,
        })
      : route;
    const warnings: { code: string; message: string }[] = [];
    const legs = legsRoute.legs.map((leg, i) => {
      const km = leg.distanceMeters / 1000;
      const dep = i === 0 ? dto.currentSocPercent : stops[i - 1].departureSoc;
      const energy = km * kwhPerKm;
      const arr = dep - (energy / usable!) * 100;
      return {
        index: i,
        distanceKm: r1(km),
        durationMinutes: Math.round(leg.durationSeconds / 60),
        energyKwh: Math.round(energy * 100) / 100,
        departureSocPercent: r1(dep),
        arrivalSocPercent: r1(arr),
      };
    });
    if (legs.some((l) => l.arrivalSocPercent < 0)) {
      throw TripsService.refuse(
        'TRIP_NO_REACHABLE_STATION',
        {
          ar: 'المسافة الفعلية عبر المحطات أطول من المتاح؛ لا يمكن اقتراح خطة.',
          en: 'The road distance through the stations is longer than the available range; no plan is suggested.',
        },
        { reason: 'road_distance_longer' },
      );
    }
    if (legs.some((l) => l.arrivalSocPercent < dto.minArrivalSocPercent)) {
      warnings.push({
        code: 'RESERVE_TIGHT',
        message: t(
          lang,
          'في أحد المراحل قد تصل بأقل من الحد الأدنى المطلوب للبطارية.',
          'On one leg you may arrive below your minimum battery level.',
        ),
      });
    }

    const now = new Date();
    const stopViews = await this.stopViews(stops, lang, now);
    const chargeLow = stops.reduce(
      (s, x) => s + (x.chargeMinutes ?? x.chargeMinutesRange?.low ?? 0),
      0,
    );
    const chargeHigh = stops.reduce(
      (s, x) => s + (x.chargeMinutes ?? x.chargeMinutesRange?.high ?? 0),
      0,
    );
    const driveMinutes = legs.reduce((s, l) => s + l.durationMinutes, 0);
    const gridKwh = stops.reduce((s, x) => s + x.gridKwh, 0);
    const cost =
      a.electricityPricePerKwh !== undefined && a.currency
        ? {
            amount: new Decimal(gridKwh).times(a.electricityPricePerKwh).toFixed(2),
            currency: a.currency,
            priceDate: a.priceDate ?? null,
            note: t(
              lang,
              'تقريبية: بسعر الكيلوواط ساعة الذي أدخلته؛ قد تختلف تعرفة كل محطة.',
              'Approximate: at the price per kWh you entered; each station’s tariff may differ.',
            ),
          }
        : null;

    if (stops.some((s) => s.chargeMinutes === null)) {
      warnings.push({
        code: 'CHARGE_TIME_ROUGH',
        message: t(
          lang,
          'لا يتوفر منحنى شحن موثّق؛ مدة الشحن نطاق تقديري منخفض الثقة.',
          'No documented charging curve; charging time is a low-confidence range.',
        ),
      });
    }
    if (stops.some((s) => s.openAtEta === 'unknown')) {
      warnings.push({
        code: 'OPENING_HOURS_UNKNOWN',
        message: t(
          lang,
          'ساعات عمل بعض المحطات غير معروفة عند موعد الوصول.',
          'Some stations’ opening hours at arrival are unknown.',
        ),
      });
    }
    if (!cost) {
      warnings.push({
        code: 'COST_NOT_CALCULATED',
        message: t(
          lang,
          'لم تُحسب التكلفة: أدخل سعر الكيلوواط ساعة والعملة.',
          'Cost not calculated: enter a price per kWh and a currency.',
        ),
      });
    }
    const lowConfidence =
      stops.some((s) => s.chargeMinutes === null || s.openAtEta !== 'open') ||
      stopViews.some((s) => s.statusConfidence === 'low') ||
      (a.consumptionKwhPer100km === undefined && v.consumption !== null);

    const assumptions = this.assumptions(lang, v, {
      usable: usable!,
      usableOrigin: a.batteryUsableKwh !== undefined ? 'user' : 'catalog',
      consumption: consumption!,
      consumptionOrigin: a.consumptionKwhPer100km !== undefined ? 'user' : 'catalog',
      margin,
      marginOrigin: a.consumptionMarginPercent !== undefined ? 'user' : 'default',
      chargeTo,
      chargeToOrigin: a.chargeToSocPercent !== undefined ? 'user' : 'default',
      corridorKm,
      corridorOrigin: a.corridorKm !== undefined ? 'user' : 'default',
      efficiency,
      efficiencyOrigin: a.efficiency !== undefined ? 'user' : 'default',
      reserve: dto.minArrivalSocPercent,
      kwhPerKm,
      departureAt,
    });

    const plan = {
      feasible: true,
      routing: { provider: legsRoute.provider, attribution: legsRoute.attribution },
      vehicle: {
        variantId: v.variantId,
        marketCode: v.marketCode,
        name: v.vehicleName,
        userVehicleId: dto.userVehicleId ?? null,
      },
      origin: { lat: dto.origin.lat, lng: dto.origin.lng, label: dto.origin.label ?? null },
      destination: {
        lat: dto.destination.lat,
        lng: dto.destination.lng,
        label: dto.destination.label ?? null,
      },
      departureAt: departureAt.toISOString(),
      summary: {
        distanceKm: r1(legs.reduce((s, l) => s + l.distanceKm, 0)),
        driveMinutes,
        chargingMinutes: { low: chargeLow, high: chargeHigh },
        totalMinutes: { low: driveMinutes + chargeLow, high: driveMinutes + chargeHigh },
        stops: stops.length,
        energyUsedKwh: Math.round(legs.reduce((s, l) => s + l.energyKwh, 0) * 100) / 100,
        energyChargedKwh: Math.round(stops.reduce((s, x) => s + x.chargeKwh, 0) * 100) / 100,
        gridEnergyKwh: Math.round(gridKwh * 100) / 100,
        arrivalSocPercent: legs[legs.length - 1].arrivalSocPercent,
        cost,
      },
      legs,
      stops: stopViews,
      assumptions,
      warnings,
      confidence: lowConfidence ? 'low' : 'medium',
      geometry: {
        type: 'LineString' as const,
        coordinates: simplify(legsRoute.geometry.coordinates, 1000),
      },
      disclaimer: t(
        lang,
        'خطة تقديرية لا تضمن الوصول ولا توافر منفذ شاغر؛ تحقق من حالة المحطة قبل التحرك. التوافر اللحظي معروض فقط عند وجود مصدر حي.',
        'An estimate: arrival and a free connector are not guaranteed; check the station before you go. Live availability is shown only when a live source provides it.',
      ),
      savedPlanId: null as string | null,
    };

    if (dto.save && userId) {
      const saved = await this.prisma.tripPlan.create({
        data: {
          userId,
          userVehicleId: dto.userVehicleId ?? null,
          variantId: dto.userVehicleId ? null : v.variantId,
          title: dto.title ?? null,
          originLabel:
            dto.origin.label ?? `${dto.origin.lat.toFixed(5)}, ${dto.origin.lng.toFixed(5)}`,
          originLat: dto.origin.lat,
          originLng: dto.origin.lng,
          destinationLabel:
            dto.destination.label ??
            `${dto.destination.lat.toFixed(5)}, ${dto.destination.lng.toFixed(5)}`,
          destinationLat: dto.destination.lat,
          destinationLng: dto.destination.lng,
          startSocPercent: dto.currentSocPercent,
          minArrivalSocPercent: dto.minArrivalSocPercent,
          plannedDepartureAt: departureAt,
          assumptions: (dto.assumptions ?? {}) as Prisma.InputJsonValue,
          result: plan as unknown as Prisma.InputJsonValue,
          routingProvider: legsRoute.provider,
        },
        select: { id: true },
      });
      plan.savedPlanId = saved.id;
    }
    return plan;
  }

  private assumptions(
    lang: Lang,
    v: VehicleData,
    x: {
      usable: number;
      usableOrigin: string;
      consumption: number;
      consumptionOrigin: string;
      margin: number;
      marginOrigin: string;
      chargeTo: number;
      chargeToOrigin: string;
      corridorKm: number;
      corridorOrigin: string;
      efficiency: number;
      efficiencyOrigin: string;
      reserve: number;
      kwhPerKm: number;
      departureAt: Date;
    },
  ) {
    return [
      {
        key: 'batteryUsableKwh',
        label: t(lang, 'السعة القابلة للاستخدام', 'Usable battery'),
        value: x.usable,
        unit: 'kWh',
        origin: x.usableOrigin,
        note: x.usableOrigin === 'catalog' ? (v.batteryUsableKwh?.note ?? null) : null,
      },
      {
        key: 'consumptionKwhPer100km',
        label: t(lang, 'الاستهلاك', 'Consumption'),
        value: x.consumption,
        unit: 'kWh/100km',
        origin: x.consumptionOrigin,
        note: x.consumptionOrigin === 'catalog' ? (v.consumption?.note ?? null) : null,
      },
      {
        key: 'consumptionMarginPercent',
        label: t(
          lang,
          'هامش إضافي للاستهلاك (سرعة/مناخ/حمولة)',
          'Extra consumption margin (speed / climate / load)',
        ),
        value: x.margin,
        unit: '%',
        origin: x.marginOrigin,
        note: null,
      },
      {
        key: 'effectiveKwhPer100km',
        label: t(lang, 'الاستهلاك المستخدم في الخطة', 'Consumption used by the plan'),
        value: Math.round(x.kwhPerKm * 10000) / 100,
        unit: 'kWh/100km',
        origin: 'default',
        note: t(
          lang,
          'يُطبّق على البطارية (تقدير متحفظ).',
          'Applied to the battery (conservative).',
        ),
      },
      {
        key: 'minArrivalSocPercent',
        label: t(lang, 'الحد الأدنى عند كل وصول', 'Minimum at every arrival'),
        value: x.reserve,
        unit: '%',
        origin: 'user',
        note: null,
      },
      {
        key: 'chargeToSocPercent',
        label: t(lang, 'أقصى شحن عند التوقف', 'Charge up to at stops'),
        value: x.chargeTo,
        unit: '%',
        origin: x.chargeToOrigin,
        note: null,
      },
      {
        key: 'corridorKm',
        label: t(lang, 'أقصى بعد للمحطة عن المسار', 'Max station distance from the route'),
        value: x.corridorKm,
        unit: 'km',
        origin: x.corridorOrigin,
        note: null,
      },
      {
        key: 'efficiency',
        label: t(lang, 'كفاءة الشحن', 'Charging efficiency'),
        value: x.efficiency,
        unit: null,
        origin: x.efficiencyOrigin,
        note: null,
      },
      {
        key: 'departureAt',
        label: t(lang, 'موعد الانطلاق', 'Departure'),
        value: x.departureAt.toISOString(),
        unit: null,
        origin: 'user',
        note: null,
      },
    ];
  }

  /** Published, non-demo, non-merged stations near the route with a compatible, usable connector. */
  private async candidates(
    route: RouteResult,
    routeKm: number,
    corridorKm: number,
    inlets: InletLike[],
  ): Promise<Candidate[]> {
    const line = route.geometry.coordinates;
    if (line.length < 2) return [];
    const simple = simplify(line, 400);
    const wkt = `LINESTRING(${simple.map(([lng, lat]) => `${lng} ${lat}`).join(',')})`;
    const rows = await this.prisma.$queryRaw<StationRow[]>(Prisma.sql`
      SELECT s."id", s."name", s."name_ar", s."name_en", s."latitude", s."longitude",
             s."address_line", s."address_ar", s."address_en", s."city",
             s."opening_hours", s."is_always_open", s."opening_hours_text", s."timezone",
             s."operational_status"::text AS "operational_status", s."access_type"::text AS "access_type",
             s."access_restrictions"
        FROM "charging_stations" s
       WHERE s."publication_status" = 'published'
         AND s."is_demo" = false
         AND s."duplicate_of_id" IS NULL
         AND s."location" IS NOT NULL
         AND ST_DWithin(s."location", ST_GeogFromText(${wkt}), ${corridorKm * 1000}::double precision)
       LIMIT 2000`);
    if (!rows.length) return [];
    const connectors = await this.prisma.connector.findMany({
      where: { stationId: { in: rows.map((r) => r.id) } },
      select: {
        id: true,
        stationId: true,
        connectorTypeCode: true,
        currentType: true,
        maxPowerKw: true,
        operationalStatus: true,
      },
    });
    const cum = cumulativeKm(line);
    const scale = cum[cum.length - 1] > 0 ? routeKm / cum[cum.length - 1] : 1;
    const out: Candidate[] = [];
    for (const r of rows) {
      const compatible = connectors
        .filter((c) => c.stationId === r.id && !EXCLUDED_CONNECTOR_STATUS.has(c.operationalStatus))
        .map((c) => {
          const compat = connectorCompatibility(
            {
              connectorTypeCode: c.connectorTypeCode,
              currentType: c.currentType,
              maxPowerKw: c.maxPowerKw === null ? null : Number(c.maxPowerKw),
            },
            inlets,
          );
          return { c, compat };
        })
        .filter((x) => x.compat.compatible)
        .sort(
          (a, b) =>
            Number(b.c.currentType === 'DC') - Number(a.c.currentType === 'DC') ||
            (b.compat.maxUsablePowerKw ?? 0) - (a.compat.maxUsablePowerKw ?? 0),
        );
      const best = compatible[0];
      if (!best) continue;
      const proj = projectOnLine(line, cum, { lat: r.latitude, lng: r.longitude });
      if (proj.offsetKm > corridorKm * 1.5) continue;
      const hours = (
        r.opening_hours && typeof r.opening_hours === 'object' ? r.opening_hours : null
      ) as OpeningHours | null;
      out.push({
        id: r.id,
        row: r,
        connectorId: best.c.id,
        alongKm: proj.alongKm * scale,
        offsetKm: proj.offsetKm,
        connector: {
          typeCode: best.c.connectorTypeCode,
          current: best.c.currentType,
          maxUsableKw: best.compat.maxUsablePowerKw,
        },
        operationalStatus: r.operational_status,
        accessType: r.access_type,
        openAt: (at: Date) => evaluateOpenNow(hours, r.is_always_open, r.timezone, at).state,
      });
    }
    return out;
  }

  private async stopViews(stops: PlannedStop[], lang: Lang, now: Date) {
    const cands = stops.flatMap((s) => [
      s.candidate as Candidate,
      ...(s.alternative ? [s.alternative as Candidate] : []),
    ]);
    const [types, observations] = await Promise.all([
      this.prisma.connectorType.findMany({
        where: { code: { in: [...new Set(cands.map((c) => c.connector.typeCode))] } },
        select: { code: true, nameAr: true, nameEn: true },
      }),
      this.prisma.availabilityObservation.findMany({
        where: { connectorId: { in: cands.map((c) => c.connectorId) } },
        orderBy: { observedAt: 'desc' },
        select: {
          connectorId: true,
          provider: true,
          status: true,
          observedAt: true,
          expiresAt: true,
        },
      }),
    ]);
    const station = (c: Candidate, etaLow: Date, etaHigh: Date) => {
      const obs = observations.find((o) => o.connectorId === c.connectorId) ?? null;
      const availability = connectorAvailability(obs, now);
      const open = (() => {
        const a = c.openAt(etaLow);
        const b = c.openAt(etaHigh);
        return a === b ? a : 'unknown';
      })();
      const type = types.find((x) => x.code === c.connector.typeCode);
      const statusConfidence: 'medium' | 'low' =
        c.operationalStatus === 'operational' && open === 'open' && c.accessType === 'public'
          ? 'medium'
          : 'low';
      return {
        station: {
          id: c.row.id,
          name: pick(lang, c.row.name_ar, c.row.name_en) ?? c.row.name,
          lat: c.row.latitude,
          lng: c.row.longitude,
          address: pick(lang, c.row.address_ar, c.row.address_en) ?? c.row.address_line,
          city: c.row.city,
        },
        positionKm: r1(c.alongKm),
        detourKm: r1(c.offsetKm * 2),
        connector: {
          type: {
            code: c.connector.typeCode,
            name: type ? pick(lang, type.nameAr, type.nameEn) : c.connector.typeCode,
          },
          currentType: c.connector.current,
          maxUsablePowerKw: c.connector.maxUsableKw,
        },
        operationalStatus: c.operationalStatus,
        accessType: c.accessType,
        accessRestrictions: c.row.access_restrictions,
        openAtEta: open,
        openingHoursText: c.row.opening_hours_text,
        availabilityNow: availability,
        statusConfidence,
      };
    };
    return stops.map((s, i) => {
      const main = station(s.candidate as Candidate, s.etaLow, s.etaHigh);
      return {
        index: i,
        ...main,
        etaAt: { earliest: s.etaLow.toISOString(), latest: s.etaHigh.toISOString() },
        arrivalSocPercent: s.arrivalSoc,
        departureSocPercent: s.departureSoc,
        chargeKwh: s.chargeKwh,
        gridEnergyKwh: s.gridKwh,
        chargeMinutes: s.chargeMinutes,
        chargeMinutesRange: s.chargeMinutesRange,
        chargeMethod: s.chargeMethod,
        alternative: s.alternative
          ? station(s.alternative as Candidate, s.etaLow, s.etaHigh)
          : null,
        notes: [
          t(
            lang,
            'التوافق مبني على بيانات منافذ السيارة الموثقة فقط.',
            'Compatibility uses the car’s verified inlet data only.',
          ),
          ...(main.availabilityNow.freshness === 'live'
            ? [
                t(
                  lang,
                  'الحالة اللحظية تخص وقت التخطيط وليست مضمونة عند الوصول.',
                  'Live status is for now, not guaranteed at arrival.',
                ),
              ]
            : [
                t(
                  lang,
                  'لا توجد بيانات توافر لحظية لهذه المحطة.',
                  'No live availability data for this station.',
                ),
              ]),
        ],
      };
    });
  }

  // ---- saved plans -------------------------------------------------------------------------

  async list(userId: string, q: ListTripsQueryDto): Promise<PaginatedResponse<unknown>> {
    const page = toPageRequest(q);
    const [rows, total] = await Promise.all([
      this.prisma.tripPlan.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: page.skip,
        take: page.take,
        select: {
          id: true,
          title: true,
          originLabel: true,
          destinationLabel: true,
          plannedDepartureAt: true,
          routingProvider: true,
          result: true,
          createdAt: true,
        },
      }),
      this.prisma.tripPlan.count({ where: { userId } }),
    ]);
    return paginated(
      rows.map((r) => {
        const summary = (r.result as { summary?: Record<string, unknown> } | null)?.summary ?? null;
        return {
          id: r.id,
          title: r.title,
          originLabel: r.originLabel,
          destinationLabel: r.destinationLabel,
          plannedDepartureAt: r.plannedDepartureAt?.toISOString() ?? null,
          routingProvider: r.routingProvider,
          summary,
          createdAt: r.createdAt.toISOString(),
        };
      }),
      total,
      page,
    );
  }

  async get(userId: string, id: string, lang: Lang) {
    const r = await this.prisma.tripPlan.findFirst({ where: { id, userId } });
    if (!r) throw notFound('trip_plan');
    return {
      id: r.id,
      title: r.title,
      createdAt: r.createdAt.toISOString(),
      plan: r.result,
      staleNotice: t(
        lang,
        'خطة محفوظة: حالة المحطات وساعات العمل ربما تغيّرت منذ الحفظ؛ أعد التخطيط قبل السفر.',
        'Saved plan: station status and hours may have changed since it was saved; plan again before you travel.',
      ),
    };
  }

  async remove(userId: string, id: string): Promise<void> {
    const res = await this.prisma.tripPlan.deleteMany({ where: { id, userId } });
    if (res.count === 0) throw notFound('trip_plan');
  }
}
