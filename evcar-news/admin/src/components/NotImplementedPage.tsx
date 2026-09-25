import { Alert, Badge, Paper, Stack, Text } from '@mantine/core';
import { IconClock } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from './PageHeader';

/**
 * Honest placeholder for sections that are not built yet. It must never be
 * replaced by fake data; the feature team swaps it for the real page.
 */
export function NotImplementedPage({ namespace }: { namespace: string }) {
  const { t } = useTranslation([namespace, 'common']);
  return (
    <Stack>
      <PageHeader
        title={t(`${namespace}:title`)}
        badge={
          <Badge color="gray" variant="light" leftSection={<IconClock size={12} aria-hidden />}>
            {t('common:notImplemented.badge')}
          </Badge>
        }
      />
      <Alert
        color="yellow"
        variant="light"
        icon={<IconClock aria-hidden />}
        title={t('common:notImplemented.title')}
        role="status"
      >
        <Text size="sm">{t('common:notImplemented.body')}</Text>
      </Alert>
      <Paper withBorder p="md" radius="md">
        <Text fw={600} size="sm" mb={4}>
          {t('common:notImplemented.plannedScope')}
        </Text>
        <Text size="sm" c="dimmed">
          {t(`${namespace}:description`)}
        </Text>
      </Paper>
    </Stack>
  );
}
