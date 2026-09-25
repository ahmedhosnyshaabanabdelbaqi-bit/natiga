import { Alert, Badge, Code, Paper, ScrollArea, Stack, Table, Text, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { EmptyState, QueryState } from '@/components/StateViews';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useJobs } from '../hooks';

const COUNTS = ['waiting', 'active', 'delayed', 'completed', 'failed'] as const;

export function JobsSection() {
  const { t, i18n } = useTranslation('system');
  const jobs = useJobs();
  const lang = i18n.language;
  return (
    <Stack>
      <Title order={3}>{t('jobs.title')}</Title>
      <Text size="sm" c="dimmed">
        {t('jobs.description')}
      </Text>
      <QueryState
        query={jobs}
        isEmpty={(j) => j.queues.length === 0}
        empty={<EmptyState title={t('jobs.emptyTitle')} description={t('jobs.emptyBody')} />}
      >
        {({ queues, recentFailures, redis, workersEnabledHere }) => (
          <Stack>
            {redis === 'down' ? (
              <Alert color="red" icon={<IconAlertTriangle aria-hidden />} role="alert">
                {t('jobs.redisDown')}
              </Alert>
            ) : null}
            {!workersEnabledHere ? (
              <Text size="sm" c="dimmed">
                {t('jobs.workersDisabledHere')}
              </Text>
            ) : null}
            <Paper withBorder radius="md">
              <ScrollArea type="auto">
                <Table verticalSpacing="sm" miw={620} striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('jobs.queue')}</Table.Th>
                      {COUNTS.map((c) => (
                        <Table.Th key={c} ta="end">
                          {t(`jobs.counts.${c}`)}
                        </Table.Th>
                      ))}
                      <Table.Th ta="end">{t('jobs.workers')}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {queues.map((q) => (
                      <Table.Tr key={q.name}>
                        <Table.Td>
                          <Code dir="ltr">{q.name}</Code>{' '}
                          {q.isPaused ? (
                            <Badge size="xs" color="yellow" variant="light">
                              {t('jobs.paused')}
                            </Badge>
                          ) : null}
                        </Table.Td>
                        {COUNTS.map((c) => {
                          // null counts = Redis unreachable: unknown, never 0.
                          const n = q.counts ? (q.counts[c] ?? 0) : null;
                          return (
                            <Table.Td key={c} ta="end">
                              {n === null ? (
                                <Text span c="dimmed" size="sm">
                                  —
                                </Text>
                              ) : c === 'failed' && n > 0 ? (
                                <Badge color="red" variant="light">
                                  {formatNumber(n, lang)}
                                </Badge>
                              ) : (
                                formatNumber(n, lang)
                              )}
                            </Table.Td>
                          );
                        })}
                        <Table.Td ta="end">
                          {q.workers === null ? '—' : formatNumber(q.workers, lang)}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Paper>
            {recentFailures.length > 0 ? (
              <Stack gap="xs">
                <Text fw={600}>{t('jobs.recentFailures')}</Text>
                {recentFailures.map((f) => (
                  <Paper key={`${f.queue}:${f.id}`} withBorder p="sm" radius="md">
                    <Text size="sm" fw={600} dir="ltr" ta="start">
                      {f.queue} · {f.name ?? f.id}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {formatDateTime(f.finishedAt, lang)}
                      {` · ${t('jobs.attempts', { count: f.attemptsMade })}`}
                    </Text>
                    {f.failedReason ? (
                      <Code block dir="ltr" mt={4} style={{ whiteSpace: 'pre-wrap' }}>
                        {f.failedReason}
                      </Code>
                    ) : null}
                  </Paper>
                ))}
              </Stack>
            ) : null}
          </Stack>
        )}
      </QueryState>
    </Stack>
  );
}
