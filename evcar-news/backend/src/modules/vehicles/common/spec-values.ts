/**
 * Validation + canonicalisation of one spec value against its definition
 * (spec_definitions: data type, canonical unit). Pure — shared by the admin
 * API and the CSV importer, unit-tested.
 */
import { SpecDataType } from '../../../generated/prisma/enums';
import { fieldError, Msg } from './catalog-errors';
import { toCanonical } from './catalog-units';
import { cleanText } from './values';

export interface SpecDefinitionLike {
  key: string;
  group: string;
  dataType: SpecDataType;
  unit: string | null;
}

export interface SpecValueInput {
  value: unknown;
  unit?: string | null;
  originalValue?: string | null;
  originalUnit?: string | null;
}

export interface StoredSpecValue {
  valueNum: number | null;
  valueText: string | null;
  valueBool: boolean | null;
  unit: string | null;
  originalValue: string | null;
  originalUnit: string | null;
}

export const SPEC_TEXT_MAX = 500;

export function normalizeSpecValue(
  def: SpecDefinitionLike,
  input: SpecValueInput,
  fieldPrefix = '',
): StoredSpecValue {
  const valueField = `${fieldPrefix}value`;
  const unitField = `${fieldPrefix}unit`;
  const hasUnit = input.unit !== undefined && input.unit !== null && input.unit.trim() !== '';
  const originalValue = cleanText(input.originalValue ?? null);
  const originalUnit = cleanText(input.originalUnit ?? null);

  switch (def.dataType) {
    case SpecDataType.number: {
      if (typeof input.value !== 'number' || !Number.isFinite(input.value)) {
        throw fieldError(valueField, 'isNumber', {
          ar: 'هذه المواصفة رقمية: أرسل رقمًا.',
          en: 'This spec is numeric: send a number.',
        });
      }
      if (input.value < 0) throw fieldError(valueField, 'min', Msg.nonNegative);
      if (def.unit === null && !Number.isInteger(input.value)) {
        throw fieldError(valueField, 'isInt', {
          ar: 'هذه المواصفة عدد صحيح.',
          en: 'This spec is a whole number.',
        });
      }
      const c = toCanonical(input.value, input.unit, def.unit, {
        field: unitField,
        decimals: 6,
        originalValue,
        originalUnit,
      });
      return {
        valueNum: c.value,
        valueText: null,
        valueBool: null,
        unit: def.unit,
        originalValue: c.originalValue,
        originalUnit: c.originalUnit,
      };
    }
    case SpecDataType.text: {
      const text = typeof input.value === 'string' ? cleanText(input.value) : null;
      if (text === null) {
        throw fieldError(valueField, 'isString', {
          ar: 'هذه المواصفة نصية: أرسل نصًا غير فارغ.',
          en: 'This spec is text: send a non-empty string.',
        });
      }
      if (text.length > SPEC_TEXT_MAX) {
        throw fieldError(valueField, 'maxLength', {
          ar: `يجب ألا يزيد النص عن ${SPEC_TEXT_MAX} حرفًا.`,
          en: `At most ${SPEC_TEXT_MAX} characters.`,
        });
      }
      if (hasUnit) throw noUnit(unitField);
      return {
        valueNum: null,
        valueText: text,
        valueBool: null,
        unit: null,
        originalValue,
        originalUnit: null,
      };
    }
    case SpecDataType.boolean: {
      if (typeof input.value !== 'boolean') {
        throw fieldError(valueField, 'isBoolean', {
          ar: 'هذه المواصفة نعم/لا: أرسل true أو false.',
          en: 'This spec is yes/no: send true or false.',
        });
      }
      if (hasUnit) throw noUnit(unitField);
      return {
        valueNum: null,
        valueText: null,
        valueBool: input.value,
        unit: null,
        originalValue,
        originalUnit: null,
      };
    }
    default:
      throw fieldError(valueField, 'type', { ar: 'نوع غير معروف.', en: 'Unknown data type.' });
  }
}

function noUnit(field: string) {
  return fieldError(field, 'unitNotAllowed', {
    ar: 'هذه المواصفة بلا وحدة قياس.',
    en: 'This spec has no unit.',
  });
}

/** True when two stored values differ (the value itself, not its provenance). */
export function specValueChanged(
  a: {
    valueNum: { toString(): string } | number | null;
    valueText: string | null;
    valueBool: boolean | null;
  },
  b: StoredSpecValue,
): boolean {
  const an = a.valueNum === null ? null : Number(a.valueNum.toString());
  const numDiff =
    an === null || b.valueNum === null ? an !== b.valueNum : Math.abs(an - b.valueNum) > 1e-9;
  return numDiff || a.valueText !== b.valueText || a.valueBool !== b.valueBool;
}
