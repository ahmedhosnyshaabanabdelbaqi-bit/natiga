import { SimpleGrid, Textarea, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export interface LocalizedText {
  ar: string;
  en: string;
}

export interface LocalizedTextInputsProps {
  label: string;
  value: LocalizedText;
  onChange: (value: LocalizedText) => void;
  /** Which languages are mandatory. */
  required?: readonly ('ar' | 'en')[];
  multiline?: boolean;
  minRows?: number;
  maxLength?: number;
  errors?: Partial<Record<'ar' | 'en', string | null | undefined>>;
  description?: string;
  disabled?: boolean;
}

/** Arabic (RTL) and English (LTR) inputs side by side, stacked on small screens. */
export function LocalizedTextInputs({
  label,
  value,
  onChange,
  required = [],
  multiline = false,
  minRows = 3,
  maxLength,
  errors,
  description,
  disabled,
}: LocalizedTextInputsProps) {
  const { t } = useTranslation('common');
  const langs = ['ar', 'en'] as const;
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
      {langs.map((lang) => {
        const common = {
          key: lang,
          label: `${label} (${t(`languages.${lang}`)})`,
          description,
          value: value[lang],
          required: required.includes(lang),
          maxLength,
          disabled,
          error: errors?.[lang] ?? undefined,
          dir: lang === 'ar' ? ('rtl' as const) : ('ltr' as const),
          lang,
        };
        return multiline ? (
          <Textarea
            {...common}
            autosize
            minRows={minRows}
            onChange={(e) => onChange({ ...value, [lang]: e.currentTarget.value })}
          />
        ) : (
          <TextInput
            {...common}
            onChange={(e) => onChange({ ...value, [lang]: e.currentTarget.value })}
          />
        );
      })}
    </SimpleGrid>
  );
}
