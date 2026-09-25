import {
  Badge,
  Button,
  Group,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconDeviceDesktop, IconDeviceMobile, IconTerminal2 } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState, QueryState } from '@/components/StateViews';
import { formatDateTime, formatRelative } from '@/lib/format';
import { sessionState, type AdminSession } from '../api';
import { useRevokeAllSessions, useRevokeSession, useUserSessions } from '../hooks';

function ClientIcon({ type }: { type: string | undefined }) {
  if (type === 'mobile') return <IconDeviceMobile size={16} aria-hidden />;
  if (type === 'cli') return <IconTerminal2 size={16} aria-hidden />;
  return <IconDeviceDesktop size={16} aria-hidden />;
}

export function SessionsSection({ userId, canManage }: { userId: string; canManage: boolean }) {
  const { t, i18n } = useTranslation(['users', 'common']);
  const lang = i18n.language;
  const sessions = useUserSessions(userId);
  const revoke = useRevokeSession();
  const revokeAll = useRevokeAllSessions();
  const [target, setTarget] = useState<AdminSession | 'all' | null>(null);

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Title order={4}>{t('users:sessions.title')}</Title>
        {canManage ? (
          <Button
            size="xs"
            color="red"
            variant="light"
            disabled={!sessions.data?.some((s) => sessionState(s) === 'active')}
            onClick={() => setTarget('all')}
          >
            {t('users:sessions.revokeAll')}
          </Button>
        ) : null}
      </Group>
      <QueryState
        query={sessions}
        isEmpty={(list) => list.length === 0}
        empty={<EmptyState title={t('users:sessions.empty')} description="" />}
      >
        {(list) => (
          <ScrollArea type="auto">
            <Table verticalSpacing="xs" miw={520}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('users:sessions.device')}</Table.Th>
                  <Table.Th>{t('users:sessions.lastUsed')}</Table.Th>
                  <Table.Th>{t('users:sessions.state')}</Table.Th>
                  {canManage ? <Table.Th /> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {list.map((s) => {
                  const state = sessionState(s);
                  return (
                    <Table.Tr key={s.id}>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <ClientIcon type={s.clientType} />
                          <Stack gap={0}>
                            <Text size="sm">
                              {s.deviceName || t('users:sessions.unknownDevice')}
                            </Text>
                            <Text size="xs" c="dimmed" dir="ltr" ta="start">
                              {[s.clientType, s.ip].filter(Boolean).join(' · ')}
                            </Text>
                          </Stack>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Tooltip
                          label={t('users:sessions.createdAt', {
                            date: formatDateTime(s.createdAt, lang),
                          })}
                        >
                          <Text size="sm">{formatRelative(s.lastUsedAt ?? s.createdAt, lang)}</Text>
                        </Tooltip>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          size="sm"
                          variant="light"
                          color={state === 'active' ? 'teal' : 'gray'}
                        >
                          {t(`users:sessions.states.${state}`)}
                        </Badge>
                      </Table.Td>
                      {canManage ? (
                        <Table.Td ta="end">
                          {state === 'active' ? (
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              color="red"
                              onClick={() => setTarget(s)}
                            >
                              {t('users:sessions.revoke')}
                            </Button>
                          ) : null}
                        </Table.Td>
                      ) : null}
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </QueryState>
      <ConfirmDialog
        opened={target !== null}
        onClose={() => setTarget(null)}
        danger
        title={t(target === 'all' ? 'users:sessions.revokeAllTitle' : 'users:sessions.revokeTitle')}
        message={t(target === 'all' ? 'users:sessions.revokeAllBody' : 'users:sessions.revokeBody')}
        confirmLabel={t(target === 'all' ? 'users:sessions.revokeAll' : 'users:sessions.revoke')}
        onConfirm={() =>
          target === 'all'
            ? revokeAll.mutateAsync(userId)
            : target
              ? revoke.mutateAsync({ userId, sessionId: target.id })
              : undefined
        }
      />
    </Stack>
  );
}
