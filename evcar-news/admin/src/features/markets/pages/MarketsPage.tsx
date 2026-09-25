import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Switch,
  Table,
  Text,
} from '@mantine/core';
import { IconInfoCircle, IconPencil, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '@/app/auth/usePermissions';
import { PERMISSIONS } from '@/app/permissions';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, QueryState } from '@/components/StateViews';
import type { AdminMarket } from '../api';
import { CurrenciesSection } from '../components/CurrenciesSection';
import { MarketFormModal } from '../components/MarketFormModal';
import { useMarkets, useUpdateMarket } from '../hooks';

export default function MarketsPage() {
  const { t, i18n } = useTranslation(['markets', 'common']);
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.marketsWrite);
  const markets = useMarkets();
  const update = useUpdateMarket();
  const [editing, setEditing] = useState<AdminMarket | null | undefined>(undefined);
  const [toggling, setToggling] = useState<AdminMarket | null>(null);

  return (
    <>
      <PageHeader
        title={t('markets:title')}
        description={t('markets:description')}
        actions={
          canWrite ? (
            <Button
              leftSection={<IconPlus size={16} aria-hidden />}
              onClick={() => setEditing(null)}
            >
              {t('markets:add')}
            </Button>
          ) : null
        }
      />
      <Alert color="blue" variant="light" icon={<IconInfoCircle aria-hidden />} mb="md">
        {t('markets:coverageNote')}
      </Alert>
      <QueryState
        query={markets}
        isEmpty={(list) => list.length === 0}
        empty={<EmptyState title={t('markets:emptyTitle')} description={t('markets:emptyBody')} />}
      >
        {(list) => (
          <Paper withBorder radius="md">
            <ScrollArea type="auto">
              <Table verticalSpacing="sm" striped miw={760}>
                <Table.Caption style={{ captionSide: 'top' }} hidden>
                  {t('markets:title')}
                </Table.Caption>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('markets:fields.code')}</Table.Th>
                    <Table.Th>{t('markets:fields.name')}</Table.Th>
                    <Table.Th>{t('markets:fields.currency')}</Table.Th>
                    <Table.Th>{t('markets:fields.timezone')}</Table.Th>
                    <Table.Th>{t('markets:fields.details')}</Table.Th>
                    <Table.Th>{t('markets:fields.enabled')}</Table.Th>
                    {canWrite ? <Table.Th /> : null}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {list.map((m) => (
                    <Table.Tr key={m.code}>
                      <Table.Td>
                        <Code dir="ltr">{m.code}</Code>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={0}>
                          <Group gap={6}>
                            <Text size="sm" fw={600} lang={i18n.language}>
                              {i18n.language === 'ar' ? m.nameAr : m.nameEn}
                            </Text>
                            {m.isDefault ? (
                              <Badge size="xs" variant="filled">
                                {t('markets:default')}
                              </Badge>
                            ) : null}
                          </Group>
                          <Text size="xs" c="dimmed" lang={i18n.language === 'ar' ? 'en' : 'ar'}>
                            {i18n.language === 'ar' ? m.nameEn : m.nameAr}
                          </Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Code dir="ltr">{m.currencyCode}</Code>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" dir="ltr" ta="start">
                          {m.timezone}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          <Badge size="xs" variant="light" color="gray">
                            {t(`common:languages.${m.defaultLanguage}`, {
                              defaultValue: m.defaultLanguage,
                            })}
                          </Badge>
                          <Badge size="xs" variant="light" color="gray">
                            {t(`markets:unitSystems.${m.unitSystem}`)}
                          </Badge>
                          <Badge size="xs" variant="light" color="gray">
                            {t(`markets:driveSides.${m.driveSide}`)}
                          </Badge>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Switch
                          checked={m.enabled}
                          // The default market cannot be disabled (API: 409 MARKET_IS_DEFAULT).
                          disabled={!canWrite || (m.isDefault && m.enabled)}
                          description={m.isDefault ? t('markets:defaultLocked') : undefined}
                          aria-label={t('markets:toggleLabel', { code: m.code })}
                          label={t(m.enabled ? 'markets:enabled' : 'markets:disabled')}
                          onChange={() => setToggling(m)}
                        />
                      </Table.Td>
                      {canWrite ? (
                        <Table.Td ta="end">
                          <Button
                            size="compact-sm"
                            variant="subtle"
                            leftSection={<IconPencil size={14} aria-hidden />}
                            onClick={() => setEditing(m)}
                          >
                            {t('common:actions.edit')}
                          </Button>
                        </Table.Td>
                      ) : null}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>
        )}
      </QueryState>
      {editing !== undefined ? (
        <MarketFormModal opened market={editing} onClose={() => setEditing(undefined)} />
      ) : null}
      <ConfirmDialog
        opened={toggling !== null}
        onClose={() => setToggling(null)}
        danger={toggling?.enabled}
        title={t(toggling?.enabled ? 'markets:disableTitle' : 'markets:enableTitle', {
          code: toggling?.code,
        })}
        message={t(toggling?.enabled ? 'markets:disableBody' : 'markets:enableBody')}
        confirmLabel={t(toggling?.enabled ? 'markets:disable' : 'markets:enable')}
        onConfirm={() =>
          toggling
            ? update.mutateAsync({ code: toggling.code, patch: { enabled: !toggling.enabled } })
            : undefined
        }
      />
      <CurrenciesSection canWrite={canWrite} />
    </>
  );
}
