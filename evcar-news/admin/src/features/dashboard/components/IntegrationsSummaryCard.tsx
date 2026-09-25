import { Anchor, Card, Group, List, RingProgress, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { QueryState } from '@/components/StateViews';
import { integrationHealth } from '@/features/system/api';
import { useIntegrations, useJobs } from '@/features/system/hooks';

/** Integrations need settings.read or integrations.read; the jobs line needs system.read. */
export function IntegrationsSummaryCard({ showJobs }: { showJobs: boolean }) {
  const { t } = useTranslation('dashboard');
  const integrations = useIntegrations();
  const jobs = useJobs(showJobs);
  return (
    <Card withBorder radius="md" padding="lg">
      <Group justify="space-between" mb="md">
        <Title order={3}>{t('integrations.title')}</Title>
        <Anchor component={Link} to="/system" size="sm">
          {t('integrations.details')}
        </Anchor>
      </Group>
      <QueryState query={integrations}>
        {({ items: list }) => {
          const configured = list.filter((i) => i.configured).length;
          const failing = list.filter((i) => integrationHealth(i) === 'error');
          const missing = list.filter((i) => !i.configured);
          const pct = list.length ? Math.round((configured / list.length) * 100) : 0;
          return (
            <Stack gap="sm">
              <Group>
                <RingProgress
                  size={84}
                  thickness={8}
                  roundCaps
                  sections={[{ value: pct, color: 'teal' }]}
                  label={
                    <Text ta="center" size="xs" fw={700}>
                      {configured}/{list.length}
                    </Text>
                  }
                />
                <Stack gap={2}>
                  <Text size="sm">
                    {t('integrations.configured', { count: configured, total: list.length })}
                  </Text>
                  {failing.length > 0 ? (
                    <Text size="sm" c="red">
                      {t('integrations.failing', { count: failing.length })}
                    </Text>
                  ) : null}
                </Stack>
              </Group>
              {missing.length > 0 ? (
                <Stack gap={4}>
                  <Text size="xs" c="dimmed">
                    {t('integrations.notConfigured')}
                  </Text>
                  <List size="sm" spacing={2}>
                    {missing.slice(0, 8).map((i) => (
                      <List.Item key={i.id}>
                        <span dir="ltr">{i.id}</span>
                      </List.Item>
                    ))}
                  </List>
                  {missing.length > 8 ? (
                    <Text size="xs" c="dimmed">
                      {t('integrations.more', { count: missing.length - 8 })}
                    </Text>
                  ) : null}
                </Stack>
              ) : null}
            </Stack>
          );
        }}
      </QueryState>
      {showJobs && jobs.data
        ? (() => {
            const failed = jobs.data.queues.reduce((n, q) => n + (q.counts?.failed ?? 0), 0);
            return jobs.data.redis === 'down' ? (
              <Text size="sm" mt="md" c="red">
                {t('jobs.redisDown')}
              </Text>
            ) : (
              <Text size="sm" mt="md" c={failed > 0 ? 'red' : 'dimmed'}>
                {t('jobs.failed', { count: failed })}
              </Text>
            );
          })()
        : null}
    </Card>
  );
}
