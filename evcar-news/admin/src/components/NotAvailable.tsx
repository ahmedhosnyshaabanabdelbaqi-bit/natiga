import { Text, type TextProps } from '@mantine/core';
import { useTranslation } from 'react-i18next';

/** Shown for `null` values. Missing data is never rendered as 0 (ARCHITECTURE §3). */
export function NotAvailable(props: TextProps) {
  const { t } = useTranslation('common');
  return (
    <Text span c="dimmed" fs="italic" size="sm" {...props}>
      {t('states.notAvailable')}
    </Text>
  );
}
