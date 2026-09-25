import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  List,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconInfoCircle, IconPlayerPlay } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '@/app/auth/usePermissions';
import { PERMISSIONS } from '@/app/permissions';
import { describeError } from '@/api/describeError';
import { EmptyState, QueryState } from '@/components/StateViews';
import { formatDateTime } from '@/lib/format';
import {
  integrationCategory,
  integrationHealth,
  type Capabilities,
  type IntegrationStatus,
  type ProviderCheck,
} from '../api';
import { useCheckIntegration, useIntegrations } from '../hooks';
import { IntegrationHealthBadge } from './IntegrationHealthBadge';

function CheckResult({ result }: { result: ProviderCheck }) {
  const { t } = useTranslation('system');
  if (result.skipped)
    return (
      <Text size="xs" c="dimmed">
        {t('integrations.checkSkipped')}
      </Text>
    );
  return (
    <Text size="xs" c={result.ok ? 'teal' : 'red'} role="status">
      {result.ok
        ? t('integrations.checkOk', { ms: Math.round(result.latencyMs ?? 0) })
        : t('integrations.checkFailed', { error: result.error ?? '' })}
    </Text>
  );
}

function IntegrationCard({ item, canCheck }: { item: IntegrationStatus; canCheck: boolean }) {
  const { t, i18n } = useTranslation('system');
  const health = integrationHealth(item);
  const lang = i18n.language;
  const check = useCheckIntegration();
  const [result, setResult] = useState<ProviderCheck | null>(null);
  return (
    <Card withBorder radius="md" padding="md" data-testid={`integration-${item.id}`}>
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Stack gap={0}>
            <Text fw={600}>{t(`providers.${item.name}`, { defaultValue: item.name })}</Text>
            <Text size="xs" c="dimmed" dir="ltr" ta="start">
              {item.id}
            </Text>
          </Stack>
          <IntegrationHealthBadge health={health} />
        </Group>
        {item.reason ? (
          // Server text (English); it names missing variables, never their values.
          <Text size="sm" dir="ltr" ta="start">
            {item.reason}
          </Text>
        ) : null}
        {item.notes && item.notes.length > 0 ? (
          <List size="xs" spacing={2} c="dimmed" dir="ltr" ta="start">
            {item.notes.map((n) => (
              <List.Item key={n}>{n}</List.Item>
            ))}
          </List>
        ) : null}
        {item.attribution ? (
          <Text size="xs" c="dimmed" dir="ltr" ta="start">
            {t('integrations.attribution')}: {item.attribution}
          </Text>
        ) : null}
        {item.lastError ? (
          <Text size="xs" c="red" dir="ltr" ta="start">
            {t('integrations.lastError')}
            {item.lastErrorAt ? ` (${formatDateTime(item.lastErrorAt, lang)})` : ''}:{' '}
            {item.lastError}
          </Text>
        ) : null}
        <Text size="xs" c="dimmed">
          {t('integrations.lastSuccess')}:{' '}
          {item.lastSuccessAt ? formatDateTime(item.lastSuccessAt, lang) : t('integrations.never')}
        </Text>
        {canCheck && item.checkable ? (
          <Group gap="xs">
            <Button
              size="compact-xs"
              variant="light"
              leftSection={<IconPlayerPlay size={12} aria-hidden />}
              loading={check.isPending}
              onClick={() =>
                check.mutate(item.id, {
                  onSuccess: (r) => setResult(r ?? null),
                  onError: (e) => setResult({ ok: false, error: describeError(e, t).message }),
                })
              }
            >
              {t('integrations.runCheck')}
            </Button>
            {result ? <CheckResult result={result} /> : null}
          </Group>
        ) : null}
      </Stack>
    </Card>
  );
}

function CapabilitiesSummary({ capabilities }: { capabilities: Capabilities }) {
  const { t } = useTranslation('system');
  return (
    <Group gap="xs">
      {(Object.keys(capabilities) as (keyof Capabilities)[]).map((k) => (
        <Badge
          key={k}
          variant="light"
          color={capabilities[k] ? 'teal' : 'gray'}
          tt="none"
          // Text, not colour alone, carries the state.
        >
          {t(`capabilities.${k}`, { defaultValue: k })}:{' '}
          {t(capabilities[k] ? 'capabilities.on' : 'capabilities.off')}
        </Badge>
      ))}
    </Group>
  );
}

export function IntegrationsSection() {
  const { t } = useTranslation('system');
  const integrations = useIntegrations();
  const { can } = usePermissions();
  const canCheck = can({ anyOf: [PERMISSIONS.settingsWrite, PERMISSIONS.integrationsWrite] });
  return (
    <Stack>
      <Title order={3}>{t('integrations.title')}</Title>
      <Text size="sm" c="dimmed">
        {t('integrations.description')}
      </Text>
      <QueryState
        query={integrations}
        isEmpty={(r) => r.items.length === 0}
        empty={
          <EmptyState
            title={t('integrations.emptyTitle')}
            description={t('integrations.emptyBody')}
          />
        }
      >
        {({ items, capabilities, note }) => {
          const counts = { ok: 0, error: 0, not_configured: 0, disabled: 0 };
          for (const i of items) counts[integrationHealth(i)] += 1;
          const groups = [...new Set(items.map(integrationCategory))];
          return (
            <Stack gap="lg">
              <Group gap="lg">
                {(Object.keys(counts) as (keyof typeof counts)[]).map((k) => (
                  <Group key={k} gap={6}>
                    <IntegrationHealthBadge health={k} />
                    <Text fw={700}>{counts[k]}</Text>
                  </Group>
                ))}
              </Group>
              {capabilities ? (
                <Stack gap={4}>
                  <Text size="sm" fw={600}>
                    {t('capabilities.title')}
                  </Text>
                  <CapabilitiesSummary capabilities={capabilities} />
                </Stack>
              ) : null}
              {note ? (
                <Alert variant="light" color="gray" icon={<IconInfoCircle aria-hidden />}>
                  {t('integrations.perInstanceNote')}
                </Alert>
              ) : null}
              {groups.map((group) => (
                <Stack key={group} gap="xs">
                  <Text fw={700} size="sm" tt="uppercase" c="dimmed">
                    {t(`categories.${group}`, { defaultValue: group })}
                  </Text>
                  <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
                    {items
                      .filter((i) => integrationCategory(i) === group)
                      .map((i) => (
                        <IntegrationCard key={i.id} item={i} canCheck={canCheck} />
                      ))}
                  </SimpleGrid>
                </Stack>
              ))}
            </Stack>
          );
        }}
      </QueryState>
    </Stack>
  );
}
