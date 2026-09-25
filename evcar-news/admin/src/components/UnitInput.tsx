import { Group, NumberInput, Select, Text, type NumberInputProps } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseNumberInput } from '@/lib/numbers';
import { alternativeUnits, roundTo, toCanonical, type CanonicalUnit } from '@/lib/units';

export interface UnitValueMeta {
  /** What the editor typed, before conversion (kept as the "original value"). */
  originalValue: number | null;
  originalUnit: string;
}

export interface UnitInputProps extends Omit<
  NumberInputProps,
  'value' | 'onChange' | 'rightSection' | 'defaultValue'
> {
  /** Value in the canonical unit; `null` = not available (never 0). */
  value: number | null;
  onChange: (canonicalValue: number | null, meta: UnitValueMeta) => void;
  unit: CanonicalUnit;
  /** Allow typing in alternative units (e.g. mi for km); converted on the fly. */
  allowAlternativeUnits?: boolean;
}

/**
 * Numeric input in a canonical unit. Empty input yields `null`, not 0.
 * When alternative units are enabled, the canonical value is shown under the field.
 */
export function UnitInput({
  value,
  onChange,
  unit,
  allowAlternativeUnits = false,
  decimalScale = 3,
  ...props
}: UnitInputProps) {
  const { t, i18n } = useTranslation('common');
  const alternatives = allowAlternativeUnits ? alternativeUnits(unit) : [];
  const [inputUnit, setInputUnit] = useState<string>(unit);
  const [raw, setRaw] = useState<number | string>(value ?? '');
  const [lastValue, setLastValue] = useState<number | null>(value);

  // Sync when the parent changes the canonical value (e.g. form reset).
  if (value !== lastValue) {
    setLastValue(value);
    if (inputUnit === unit) setRaw(value ?? '');
  }

  const emit = (nextRaw: number | string, nextUnit: string) => {
    const typed = parseNumberInput(nextRaw);
    const canonical = typed === null ? null : toCanonical(typed, nextUnit, unit);
    const rounded = canonical === null ? null : roundTo(canonical, decimalScale);
    setLastValue(rounded);
    onChange(rounded, { originalValue: typed, originalUnit: nextUnit });
  };

  const unitSection =
    alternatives.length > 0 ? (
      <Select
        aria-label={t('units.inputUnit')}
        data={[unit, ...alternatives]}
        value={inputUnit}
        onChange={(u) => {
          if (!u) return;
          setInputUnit(u);
          emit(raw, u);
        }}
        allowDeselect={false}
        w={110}
        size={typeof props.size === 'string' ? props.size : 'sm'}
        comboboxProps={{ withinPortal: true }}
      />
    ) : (
      <Text size="sm" c="dimmed" px={6} style={{ whiteSpace: 'nowrap' }}>
        {unit}
      </Text>
    );

  const converted = inputUnit !== unit && value !== null;

  return (
    <div>
      <Group gap={6} wrap="nowrap" align="flex-end">
        <NumberInput
          {...props}
          style={{ flex: 1 }}
          value={raw}
          decimalScale={decimalScale}
          allowNegative={props.allowNegative ?? false}
          hideControls
          onChange={(v) => {
            setRaw(v);
            emit(v, inputUnit);
          }}
          rightSection={alternatives.length > 0 ? undefined : unitSection}
          rightSectionWidth={alternatives.length > 0 ? undefined : 70}
        />
        {alternatives.length > 0 ? unitSection : null}
      </Group>
      {converted ? (
        <Text size="xs" c="dimmed" mt={4} aria-live="polite">
          {t('units.storedAs', {
            value: new Intl.NumberFormat(i18n.language, {
              maximumFractionDigits: decimalScale,
            }).format(value),
            unit,
          })}
        </Text>
      ) : null}
    </div>
  );
}
