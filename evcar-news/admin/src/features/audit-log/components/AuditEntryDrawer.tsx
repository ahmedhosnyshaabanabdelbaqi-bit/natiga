import { Code, Drawer, Stack, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { isApiError } from '@/api/errors';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { formatDateTime } from '@/lib/format';
import { actorLabel, auditApi, auditKeys, type AuditLogEntry } from '../api';
import { DiffView } from './DiffView';

export function AuditEntryDrawer({
  entryId,
  fallback,
  onClose,
}: {
  entryId: string | null;
  /** Row from the list, used if the detail endpoint is not available. */
  fallback: AuditLogEntry | undefined;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation('audit-log');
  const detail = useQuery({
    queryKey: auditKeys.detail(entryId ?? ''),
    queryFn: ({ signal }) => auditApi.get(entryId ?? '', signal),
    enabled: !!entryId,
  });
  const detailMissing = isApiError(detail.error) && detail.error.status === 404;
  const entry = detail.data ?? (detailMissing ? fallback : undefined);

  return (
    <Drawer
      opened={!!entryId}
      onClose={onClose}
      // Mantine resolves `right` to the end side, i.e. the left edge in RTL.
      position="right"
      size="xl"
      title={<Text fw={700}>{t('drawer.title')}</Text>}
    >
      {detail.isPending && !entry ? (
        <LoadingState />
      ) : !entry ? (
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      ) : (
        <Stack gap="lg">
          <Table variant="vertical" layout="fixed" withTableBorder>
            <Table.Tbody>
              {(
                [
                  ['time', formatDateTime(entry.createdAt, i18n.language)],
                  ['actor', actorLabel(entry, t('system'))],
                  [
                    'action',
                    <Code key="a" dir="ltr">
                      {entry.action}
                    </Code>,
                  ],
                  [
                    'entity',
                    <Code key="e" dir="ltr">
                      {entry.entityType}
                    </Code>,
                  ],
                  [
                    'entityId',
                    entry.entityId ? (
                      <Code key="i" dir="ltr">
                        {entry.entityId}
                      </Code>
                    ) : (
                      '—'
                    ),
                  ],
                  [
                    'ip',
                    entry.ip ? (
                      <Code key="ip" dir="ltr">
                        {entry.ip}
                      </Code>
                    ) : (
                      '—'
                    ),
                  ],
                  ['userAgent', entry.userAgent ?? '—'],
                  [
                    'requestId',
                    entry.requestId ? (
                      <Code key="r" dir="ltr">
                        {entry.requestId}
                      </Code>
                    ) : (
                      '—'
                    ),
                  ],
                ] as const
              ).map(([key, value]) => (
                <Table.Tr key={key}>
                  <Table.Th w={140}>{t(`columns.${key}`)}</Table.Th>
                  <Table.Td style={{ wordBreak: 'break-word' }}>{value}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Stack gap="xs">
            <Title order={4}>{t('diff.title')}</Title>
            <DiffView before={entry.before} after={entry.after} />
          </Stack>
        </Stack>
      )}
    </Drawer>
  );
}
