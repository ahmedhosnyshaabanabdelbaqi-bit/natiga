/**
 * Pure builders of the grouped spec sheet (REQUIREMENTS §6): market-scoped
 * values (a market row overrides the global row), every definition listed
 * with `point: null` when missing (never 0), kW ↔ hp derived by unit
 * conversion only when one of them is not stored.
 */
import type { SupportedLanguage } from '../../../config/app-config';
import type { SpecificationSource } from '../../../generated/prisma/client';
import { hpToKw, kwToHp } from '../../../common/units/units';
import { SPEC_GROUP_LABELS, SPEC_GROUP_ORDER } from '../common/catalog-constants';
import { metaOf } from '../common/views';
import { pick, round, textIn, toNum } from '../common/values';
import type { DataPointDto } from '../dto/shared.dto';
import type { SpecGroupDto, SpecItemDto } from '../dto/public.dto';

export interface SpecDefRow {
  key: string;
  group: string;
  dataType: string;
  unit: string | null;
  betterDirection: string;
  labelEn: string;
  labelAr: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  isKeySpec: boolean;
  sortOrder: number;
}

export interface SpecRow {
  specKey: string;
  marketCode: string | null;
  valueNum: { toString(): string } | number | null;
  valueText: string | null;
  valueBool: boolean | null;
  unit: string | null;
  originalValue: string | null;
  originalUnit: string | null;
  reliability: string;
  verifiedAt: Date | null;
  source?: SpecificationSource | null;
}

/** Per key: the market row when present, else the global row. */
export function scopeSpecs<T extends SpecRow>(rows: T[], market: string): Map<string, T> {
  const out = new Map<string, T>();
  for (const r of rows) {
    if (r.marketCode !== null && r.marketCode !== market) continue;
    const prev = out.get(r.specKey);
    if (!prev || (prev.marketCode === null && r.marketCode === market)) out.set(r.specKey, r);
  }
  return out;
}

export function specPoint(row: SpecRow, def?: Pick<SpecDefRow, 'unit'>): DataPointDto | null {
  const num = row.valueNum === null ? null : toNum(row.valueNum.toString());
  const value = num ?? row.valueText ?? row.valueBool;
  if (value === null || value === undefined) return null;
  return {
    value,
    unit: row.unit ?? def?.unit ?? null,
    originalValue: row.originalValue,
    originalUnit: row.originalUnit,
    marketCode: row.marketCode,
    derived: false,
    ...metaOf(row),
  };
}

const POWER_KW = 'performance.power_kw';
const POWER_HP = 'performance.power_hp';

/** Scoped points by key, with hp / kW derived from each other when one is missing. */
export function pointsByKey(rows: SpecRow[], market: string): Map<string, DataPointDto> {
  const scoped = scopeSpecs(rows, market);
  const points = new Map<string, DataPointDto>();
  for (const [key, row] of scoped) {
    const p = specPoint(row);
    if (p) points.set(key, p);
  }
  const kw = points.get(POWER_KW);
  const hp = points.get(POWER_HP);
  if (kw && !hp && typeof kw.value === 'number') {
    points.set(POWER_HP, {
      ...kw,
      value: round(kwToHp(kw.value), 0),
      unit: 'hp',
      originalValue: String(kw.value),
      originalUnit: 'kW',
      derived: true,
    });
  } else if (hp && !kw && typeof hp.value === 'number') {
    points.set(POWER_KW, {
      ...hp,
      value: round(hpToKw(hp.value), 1),
      unit: 'kW',
      originalValue: String(hp.value),
      originalUnit: 'hp',
      derived: true,
    });
  }
  return points;
}

/** Every definition grouped in display order; missing values → point null. */
export function buildSpecGroups(
  defs: SpecDefRow[],
  points: Map<string, DataPointDto>,
  lang: SupportedLanguage,
): SpecGroupDto[] {
  const byGroup = new Map<string, SpecDefRow[]>();
  for (const d of defs) {
    const list = byGroup.get(d.group) ?? [];
    list.push(d);
    byGroup.set(d.group, list);
  }
  const order = [
    ...SPEC_GROUP_ORDER.filter((g) => byGroup.has(g)),
    ...[...byGroup.keys()]
      .filter((g) => !(SPEC_GROUP_ORDER as readonly string[]).includes(g))
      .sort(),
  ];
  return order.map((group) => {
    const label = SPEC_GROUP_LABELS[group];
    const items: SpecItemDto[] = (byGroup.get(group) ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
      .map((d) => ({
        key: d.key,
        label: pick(lang, d.labelAr, d.labelEn),
        description: textIn(lang, d.descriptionAr, d.descriptionEn),
        dataType: d.dataType,
        unit: d.unit,
        betterDirection: d.betterDirection,
        isKeySpec: d.isKeySpec,
        point: points.get(d.key) ?? null,
      }));
    return { key: group, label: label ? pick(lang, label.ar, label.en) : group, items };
  });
}

/** Numeric value of a point (null when missing or not numeric). */
export function numOf(p: DataPointDto | null | undefined): number | null {
  return p && typeof p.value === 'number' ? p.value : null;
}
