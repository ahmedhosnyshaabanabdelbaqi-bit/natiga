import {
  Alert,
  Badge,
  Card,
  Group,
  List,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconCircleX, IconFlask } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { NotAvailable } from '@/components/NotAvailable';
import { QueryState } from '@/components/StateViews';
import { useHealth, useSystemOverview } from '@/features/system/hooks';
import { formatDateTime, formatNumber } from '@/lib/format';
import {
  countTiles,
  demoRows,
  servicesFromHealth,
  splitDuration,
  staleTiles,
  type ServiceState,
} from '../overview';

const STATE_META: Record<ServiceState, { color: string; icon: typeof IconCircleCheck }> = {
  up: { color: 'teal', icon: IconCircleCheck },
  down: { color: 'red', icon: IconCircleX },
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      {children}
    </Stack>
  );
}

/** Version, uptime and dependency checks from the public GET /health. */
function HealthRow({ environment }: { environment: string | undefined }) {
  const { t, i18n } = useTranslation('dashboard');
  const health = useHealth();
  const h = health.data;
  const uptime = h ? splitDuration(h.uptimeSeconds) : null;
  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Field label={t('overview.version')}>
          {h ? (
            <Text fw={600} dir="ltr" ta="start">
              {h.version}
            </Text>
          ) : (
            <NotAvailable />
          )}
        </Field>
        <Field label={t('overview.environment')}>
          {environment ? (
            <Badge variant="light" color={environment === 'production' ? 'red' : 'blue'}>
              {environment}
            </Badge>
          ) : (
            <NotAvailable />
          )}
        </Field>
        <Field label={t('overview.uptime')}>
          {uptime ? <Text fw={600}>{t('overview.uptimeValue', uptime)}</Text> : <NotAvailable />}
        </Field>
      </SimpleGrid>
      {h ? (
        <Stack gap="xs">
          <Text fw={600} size="sm">
            {t('overview.services')}
          </Text>
          <Group gap="sm">
            {servicesFromHealth(h).map((s) => {
              const meta = STATE_META[s.state];
              const Icon = meta.icon;
              return (
                <Badge
                  key={s.key}
                  size="lg"
                  variant="light"
                  color={meta.color}
                  leftSection={<Icon size={14} aria-hidden />}
                  tt="none"
                >
                  {t(`overview.serviceNames.${s.key}`)}: {t(`overview.states.${s.state}`)}
                  {s.latencyMs !== undefined
                    ? // LRI…PDI keeps "31 ms" in order inside RTL text.
                      ` · \u2066${formatNumber(Math.round(s.latencyMs), i18n.language)} ms\u2069`
                    : ''}
                </Badge>
              );
            })}
          </Group>
        </Stack>
      ) : health.isError ? (
        <Text size="sm" c="red">
          {t('overview.healthUnavailable')}
        </Text>
      ) : null}
    </Stack>
  );
}

export function SystemOverviewCard() {
  const { t, i18n } = useTranslation('dashboard');
  const overview = useSystemOverview();
  const lang = i18n.language;
  return (
    <Card withBorder radius="md" padding="lg">
      <Title order={3} mb="md">
        {t('overview.title')}
      </Title>
      <Stack gap="lg">
        <HealthRow environment={overview.data?.environment} />
        <QueryState query={overview}>
          {(o) => (
            <Stack gap="lg">
              {o.warnings.length > 0 ? (
                <Alert
                  color="yellow"
                  variant="light"
                  icon={<IconAlertTriangle aria-hidden />}
                  title={t('overview.warningsTitle')}
                >
                  <List size="sm" spacing={2}>
                    {o.warnings.map((w) => (
                      <List.Item key={w}>
                        {t(`overview.warnings.${w}`, { defaultValue: w })}
                      </List.Item>
                    ))}
                  </List>
                </Alert>
              ) : null}
              {demoRows(o).length > 0 ? (
                <Alert color="grape" variant="light" icon={<IconFlask aria-hidden />}>
                  {t('overview.demoRows', {
                    list: demoRows(o)
                      .map(([k, n]) => `${t(`overview.demoKinds.${k}`, { defaultValue: k })}: ${n}`)
                      .join(lang === 'ar' ? '، ' : ', '),
                  })}
                </Alert>
              ) : null}
              <Stack gap="xs">
                <Text fw={600} size="sm">
                  {t('overview.counts')}
                </Text>
                <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }}>
                  {countTiles(o).map((c) => {
                    const breakdown = Object.entries(c.breakdown ?? {});
                    const card = (
                      <Card key={c.key} withBorder radius="md" padding="sm">
                        <Text size="xs" c="dimmed">
                          {t(`overview.countNames.${c.key}`)}
                        </Text>
                        <Text
                          fw={700}
                          size="xl"
                          c={c.attention && c.value > 0 ? 'orange' : undefined}
                        >
                          {formatNumber(c.value, lang)}
                        </Text>
                        {breakdown.length > 0 ? (
                          <Text size="xs" c="dimmed" lineClamp={2}>
                            {breakdown
                              .map(
                                ([k, n]) =>
                                  `${t(`overview.statuses.${k}`, { defaultValue: k })} ${formatNumber(n, lang)}`,
                              )
                              .join(' · ')}
                          </Text>
                        ) : null}
                      </Card>
                    );
                    return breakdown.length > 2 ? (
                      <Tooltip
                        key={c.key}
                        multiline
                        w={240}
                        label={breakdown
                          .map(
                            ([k, n]) => `${t(`overview.statuses.${k}`, { defaultValue: k })}: ${n}`,
                          )
                          .join('\n')}
                      >
                        {card}
                      </Tooltip>
                    ) : (
                      card
                    );
                  })}
                </SimpleGrid>
              </Stack>
              <Stack gap="xs">
                <Text fw={600} size="sm">
                  {t('overview.stale')}
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                  {staleTiles(o).map((s) => (
                    <Group key={s.key} gap="xs" wrap="nowrap" align="flex-start">
                      <Badge
                        variant="light"
                        color={s.value > 0 ? 'orange' : 'teal'}
                        style={{ flexShrink: 0 }}
                      >
                        {formatNumber(s.value, lang)}
                      </Badge>
                      <Text size="sm">
                        {t(`overview.staleNames.${s.key}`, { threshold: s.threshold })}
                      </Text>
                    </Group>
                  ))}
                </SimpleGrid>
              </Stack>
              <Group gap="lg">
                <Text size="sm">{t('overview.importsRunning', { count: o.imports.running })}</Text>
                <Text size="sm" c={o.imports.failedLast7Days > 0 ? 'red' : undefined}>
                  {t('overview.importsFailed', { count: o.imports.failedLast7Days })}
                </Text>
              </Group>
              <Text size="xs" c="dimmed">
                {t('overview.serverTime', { date: formatDateTime(o.generatedAt, lang) })}
              </Text>
            </Stack>
          )}
        </QueryState>
      </Stack>
    </Card>
  );
}
