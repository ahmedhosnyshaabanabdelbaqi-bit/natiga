import { Group, Select, TextInput } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Money } from '@/api/types';
import { isDecimalString, normalizeDigits } from '@/lib/numbers';

export interface MoneyInputProps {
  label: string;
  /** `null` = no price (never 0). */
  value: Money | null;
  onChange: (value: Money | null) => void;
  /** ISO 4217 codes allowed, e.g. the currencies of enabled markets. */
  currencies: string[];
  defaultCurrency?: string;
  required?: boolean;
  error?: string | null | undefined;
  description?: string;
  disabled?: boolean;
  /** Fraction digits allowed in the amount. */
  scale?: number;
}

/**
 * Amount + currency. The amount stays a decimal string (as in the API) to avoid
 * float rounding; Arabic-Indic digits are accepted and normalised.
 */
export function MoneyInput({
  label,
  value,
  onChange,
  currencies,
  defaultCurrency,
  required,
  error,
  description,
  disabled,
  scale = 2,
}: MoneyInputProps) {
  const { t } = useTranslation('common');
  const [text, setText] = useState(value?.amount ?? '');
  const [currency, setCurrency] = useState(
    value?.currency ?? defaultCurrency ?? currencies[0] ?? '',
  );
  const [lastValue, setLastValue] = useState(value);
  const [localError, setLocalError] = useState<string | null>(null);

  if (value !== lastValue) {
    setLastValue(value);
    setText(value?.amount ?? '');
    if (value?.currency) setCurrency(value.currency);
  }

  const emit = (nextText: string, nextCurrency: string) => {
    const normalized = normalizeDigits(nextText).replace(/[\s,]/g, '');
    if (normalized === '') {
      setLocalError(null);
      setLastValue(null);
      onChange(null);
      return;
    }
    if (!isDecimalString(normalized, scale)) {
      setLocalError(t('validation.decimal', { scale }));
      return;
    }
    setLocalError(null);
    const next = { amount: normalized, currency: nextCurrency };
    setLastValue(next);
    onChange(next);
  };

  return (
    <Group gap={6} align="flex-start" wrap="nowrap">
      <TextInput
        style={{ flex: 1 }}
        label={label}
        description={description}
        required={required}
        disabled={disabled}
        inputMode="decimal"
        dir="ltr"
        value={text}
        error={localError ?? error ?? undefined}
        placeholder={t('states.notAvailable')}
        onChange={(e) => {
          setText(e.currentTarget.value);
          emit(e.currentTarget.value, currency);
        }}
      />
      <Select
        label={t('money.currency')}
        w={110}
        data={currencies}
        value={currency}
        disabled={disabled}
        allowDeselect={false}
        onChange={(c) => {
          if (!c) return;
          setCurrency(c);
          emit(text, c);
        }}
      />
    </Group>
  );
}
