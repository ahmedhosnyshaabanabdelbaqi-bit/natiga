/**
 * Generates engine_parity.json from the BACKEND TypeScript calculators engine
 * so the Dart port (lib/features/calculators/domain/engine) can be checked
 * for byte-identical results (test/features/calculators/engine_parity_test.dart).
 *
 * Run from backend/ (uses its ts-node + node_modules):
 *   cd backend && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","ignoreDeprecations":"6.0"}' \
 *     npx ts-node --transpile-only ../mobile/test/features/calculators/fixtures/generate_engine_parity.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as E from '../../../../../backend/src/modules/calculators/engine';

type Fn = (input: any, lang: 'ar' | 'en', prov?: any) => unknown;
const calcs: Record<string, Fn> = {
  'charge-cost': E.chargeCost as Fn,
  'charge-time': E.chargeTime as Fn,
  'cost-per-100km': E.costPer100km as Fn,
  'monthly-cost': E.monthlyCost as Fn,
  'vs-fuel': E.vsFuel as Fn,
  tco: E.tco as Fn,
};

const elec = { consumptionKwhPer100km: 16.4, electricityPricePerKwh: 1.35, currency: 'EGP', priceDate: '2026-09-01' };
const cases: { calc: string; input: any; prov?: any }[] = [
  // REQUIREMENTS §23 vector: 60 kWh, 20→80 % = 36 kWh; 0.9 → 40 kWh grid.
  { calc: 'charge-cost', input: { batteryUsableKwh: 60, fromSocPercent: 20, toSocPercent: 80, efficiency: 0.9, currency: 'EGP', priceDate: '2026-09-01', tariff: { energyPerKwh: 2 } } },
  { calc: 'charge-cost', input: { batteryUsableKwh: 60, fromSocPercent: 20, toSocPercent: 80, currency: 'EGP', tariff: { energyPerKwh: 1.7 } } },
  { calc: 'charge-cost', input: { energyKwh: 42.5, energyBasis: 'grid', efficiency: 0.85, currency: 'SAR', priceDate: '2026-01-15', tariff: { energyPerKwh: 0.18, sessionFee: 5 } } },
  { calc: 'charge-cost', input: { energyKwh: 30, currency: 'AED', tariff: { energyPerKwh: 1.2, timePerHour: 7, parkingPerMinute: 0.1, idlePerHour: 30, idleGraceMinutes: 15 }, chargingMinutes: 47, parkingMinutes: 60, idleMinutes: 40 } },
  { calc: 'charge-cost', input: { batteryUsableKwh: 77.4, fromSocPercent: 12.5, toSocPercent: 91, efficiency: 0.93, currency: 'EGP', tariff: { energyPerKwh: 3.333, timePerMinute: 0.25, parkingFlat: 10 }, chargingMinutes: 33.3 } },
  { calc: 'charge-cost', input: { batteryUsableKwh: 50, fromSocPercent: 10, toSocPercent: 90, currency: 'EGP', tariff: { energyPerKwh: 0 } } },
  { calc: 'charge-cost', input: { batteryUsableKwh: 50, fromSocPercent: 10, toSocPercent: 90, currency: 'EGP', tariff: { idlePerMinute: 1 }, idleMinutes: 5, tariffX: 1 } },
  // errors
  { calc: 'charge-cost', input: { batteryUsableKwh: 0, fromSocPercent: 80, toSocPercent: 20, currency: 'egp' } },
  { calc: 'charge-cost', input: { batteryUsableKwh: -5, fromSocPercent: 20, toSocPercent: 80, efficiency: 0, currency: 'EGP', tariff: {} } },
  { calc: 'charge-cost', input: { energyBasis: 'grid', batteryUsableKwh: 60, fromSocPercent: 20, toSocPercent: 80, efficiency: 1.2, currency: 'EGP', priceDate: '2026-02-30', tariff: { energyPerKwh: 2, timePerMinute: 1, timePerHour: 60, parkingPerHour: 5, parkingFlat: 3 } } },
  { calc: 'charge-cost', input: { batteryUsableKwh: 'abc', fromSocPercent: '20', toSocPercent: 80, currency: 'EGP', tariff: { energyPerKwh: '1.5' } } },
  { calc: 'charge-cost', input: {} },
  // charge time
  { calc: 'charge-time', input: { currentType: 'AC', batteryUsableKwh: 60, fromSocPercent: 20, toSocPercent: 80, vehicleAcMaxKw: 11, stationPowerKw: 22 } },
  { calc: 'charge-time', input: { currentType: 'AC', batteryUsableKwh: 60, fromSocPercent: 20, toSocPercent: 100, efficiency: 0.88, supplyPhases: 1, supplyAmps: 16 } },
  { calc: 'charge-time', input: { currentType: 'AC', batteryUsableKwh: 82, fromSocPercent: 5, toSocPercent: 95, vehicleAcMaxKw: 7.4, supplyPhases: 3, supplyAmps: 32, supplyVoltsPerPhase: 220, stationPowerKw: 22 } },
  { calc: 'charge-time', input: { currentType: 'DC', batteryUsableKwh: 60, fromSocPercent: 10, toSocPercent: 80, vehicleDcPeakKw: 135, stationPowerKw: 50 } },
  { calc: 'charge-time', input: { currentType: 'DC', batteryUsableKwh: 72.6, fromSocPercent: 10, toSocPercent: 80, stationPowerKw: 150, curve: [{ socPercent: 0, powerKw: 90 }, { socPercent: 10, powerKw: 170 }, { socPercent: 50, powerKw: 140 }, { socPercent: 80, powerKw: 70 }, { socPercent: 100, powerKw: 10 }] } },
  { calc: 'charge-time', input: { currentType: 'DC', batteryUsableKwh: 72.6, fromSocPercent: 10.3, toSocPercent: 77.7, curve: [{ socPercent: 0, powerKw: 90 }, { socPercent: 10, powerKw: 170 }, { socPercent: 80, powerKw: 70 }] } },
  { calc: 'charge-time', input: { currentType: 'DC', batteryUsableKwh: 60, fromSocPercent: 5, toSocPercent: 90, vehicleDcPeakKw: 100, curve: [{ socPercent: 10, powerKw: 90 }, { socPercent: 80, powerKw: 60 }] } },
  { calc: 'charge-time', input: { currentType: 'DC', batteryUsableKwh: 60, fromSocPercent: 5, toSocPercent: 90, curve: [{ socPercent: 10, powerKw: 90 }, { socPercent: 80, powerKw: 60 }] } },
  { calc: 'charge-time', input: { currentType: 'DC', batteryUsableKwh: 60, fromSocPercent: 10, toSocPercent: 80, curve: [{ socPercent: 0, powerKw: 0 }, { socPercent: 100, powerKw: 0 }] } },
  { calc: 'charge-time', input: { currentType: 'XX', batteryUsableKwh: 60, fromSocPercent: 10, toSocPercent: 80, supplyPhases: 2, curve: [{ socPercent: 50, powerKw: 1 }, { socPercent: 40, powerKw: 2 }] } },
  { calc: 'charge-time', input: { currentType: 'AC', batteryUsableKwh: 60, fromSocPercent: 10, toSocPercent: 80 } },
  { calc: 'charge-time', input: { currentType: 'AC', batteryUsableKwh: 60, fromSocPercent: 10, toSocPercent: 80, vehicleAcMaxKw: 11 }, prov: { batteryUsableKwh: { origin: 'catalog', note: 'Manufacturer claim · test source' }, vehicleAcMaxKw: { origin: 'catalog', note: 'verified' } } },
  // running costs
  { calc: 'cost-per-100km', input: { ...elec } },
  { calc: 'cost-per-100km', input: { consumptionWhPerKm: 172, consumptionBasis: 'battery', electricityPricePerKwh: 0.9, publicPricePerKwh: 2.75, publicSharePercent: 30, currency: 'EGP' } },
  { calc: 'cost-per-100km', input: { consumptionKwhPer100km: 15, consumptionBasis: 'battery', efficiency: 0.87, electricityPricePerKwh: 1, currency: 'SAR' } },
  { calc: 'cost-per-100km', input: { consumptionKwhPer100km: 15, efficiency: 0.87, electricityPricePerKwh: 1, currency: 'SAR' }, prov: { consumptionKwhPer100km: { origin: 'catalog', note: 'WLTP' }, electricityPricePerKwh: { origin: 'reference_price', note: 'Reference price · x · effective from 2025-01-01' }, priceDate: { origin: 'reference_price' } } },
  { calc: 'cost-per-100km', input: { consumptionKwhPer100km: 15, consumptionWhPerKm: 150, consumptionBasis: 'x', electricityPricePerKwh: -1, publicSharePercent: 20, currency: 'EGP' } },
  { calc: 'cost-per-100km', input: { publicPricePerKwh: 2 } },
  { calc: 'monthly-cost', input: { ...elec, kmPerMonth: 1500 } },
  { calc: 'monthly-cost', input: { ...elec, kmPerDay: 42, fixedMonthlyFees: 150 } },
  { calc: 'monthly-cost', input: { ...elec, kmPerDay: 42, kmPerMonth: 100 } },
  { calc: 'monthly-cost', input: { ...elec } },
  { calc: 'vs-fuel', input: { ...elec, fuelConsumptionLPer100km: 7.5, fuelPricePerLiter: 13.75 } },
  { calc: 'vs-fuel', input: { ...elec, fuelConsumptionLPer100km: 7.5, fuelPricePerLiter: 0, kmPerDay: 30 } },
  { calc: 'vs-fuel', input: { consumptionKwhPer100km: 20, electricityPricePerKwh: 5, currency: 'EGP', fuelConsumptionLPer100km: 5, fuelPricePerLiter: 10, kmPerMonth: 1000 } },
  { calc: 'vs-fuel', input: { ...elec } },
  { calc: 'tco', input: { ...elec, years: 5, kmPerYear: 15000, ev: { purchasePrice: 1850000, incentives: 50000, residualValue: 900000, insurancePerYear: 45000, maintenancePerYear: 4000, oneOffCosts: 35000 }, fuelCar: { purchasePrice: 1300000, residualValue: 650000, insurancePerYear: 30000, maintenancePerYear: 12000, fuelConsumptionLPer100km: 7.2, fuelPricePerLiter: 15.25 } } },
  { calc: 'tco', input: { ...elec, years: 3, kmPerYear: 12345, ev: { purchasePrice: 999999.99 } } },
  { calc: 'tco', input: { ...elec, years: 0, kmPerYear: -1, ev: {}, fuelCar: { purchasePrice: 5 } } },
];

const out: any[] = [];
for (const c of cases) {
  for (const lang of ['en', 'ar'] as const) {
    try {
      out.push({ calc: c.calc, lang, input: c.input, prov: c.prov ?? null, output: calcs[c.calc](c.input, lang, c.prov) });
    } catch (err) {
      if (!(err instanceof E.CalcInputError)) throw err;
      out.push({
        calc: c.calc,
        lang,
        input: c.input,
        prov: c.prov ?? null,
        problems: err.problems.map((p) => ({ field: p.field, rule: p.rule, message: p.message[lang] })),
      });
    }
  }
}
writeFileSync(join(__dirname, 'engine_parity.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${out.length} cases`);
