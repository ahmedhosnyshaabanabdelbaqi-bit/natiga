import { Button, Code, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { IconFilterOff } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { DataTable, useTableState, type DataTableColumn } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { formatDateTime } from '@/lib/format';
import { actorLabel, auditApi, auditKeys, dayRangeToIso, type AuditLogEntry } from '../api';
import { AuditEntryDrawer } from '../components/AuditEntryDrawer';

const FILTERS = ['q', 'entityType', 'entityId', 'action', 'actorId', 'from', 'to'] as const;

export default function AuditLogPage() {
  const { t, i18n } = useTranslation(['audit-log', 'common']);
  const table = useTableState({
    filters: FILTERS,
    defaultSort: { field: 'createdAt', direction: 'desc' },
  });
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('entry');

  const apiQuery = useMemo(() => {
    const { from, to, ...rest } = table.query;
    return { ...rest, ...dayRangeToIso(String(from ?? ''), String(to ?? '')) };
  }, [table.query]);

  const logs = useQuery({
    queryKey: auditKeys.list(apiQuery),
    queryFn: ({ signal }) => auditApi.list(apiQuery, signal),
    placeholderData: (prev) => prev,
  });

  const select = (id: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set('entry', id);
      else next.delete('entry');
      return next;
    });

  const columns: DataTableColumn<AuditLogEntry>[] = [
    {
      key: 'createdAt',
      header: t('audit-log:columns.time'),
      sortable: true,
      render: (e) => <Text size="sm">{formatDateTime(e.createdAt, i18n.language)}</Text>,
    },
    {
      key: 'actor',
      header: t('audit-log:columns.actor'),
      render: (e) => (
        <Stack gap={0}>
          <Text size="sm">{actorLabel(e, t('audit-log:system'))}</Text>
          {e.actor?.email && e.actor.displayName ? (
            <Text size="xs" c="dimmed" dir="ltr" ta="start">
              {e.actor.email}
            </Text>
          ) : null}
        </Stack>
      ),
    },
    {
      key: 'action',
      header: t('audit-log:columns.action'),

      render: (e) => <Code dir="ltr">{e.action}</Code>,
    },
    {
      key: 'entityType',
      header: t('audit-log:columns.entity'),

      render: (e) => (
        <Stack gap={0}>
          <Code dir="ltr">{e.entityType}</Code>
          {e.entityId ? (
            <Text size="xs" c="dimmed" dir="ltr" ta="start" truncate maw={220}>
              {e.entityId}
            </Text>
          ) : null}
        </Stack>
      ),
    },
    {
      key: 'ip',
      header: t('audit-log:columns.ip'),
      visibleFrom: 'lg',
      render: (e) => (
        <Text size="xs" dir="ltr" ta="start">
          {e.ip ?? '—'}
        </Text>
      ),
    },
  ];

  const hasFilters = FILTERS.some((f) => table.filters[f]);

  return (
    <>
      <PageHeader title={t('audit-log:title')} description={t('audit-log:description')} />
      <DataTable
        caption={t('audit-log:title')}
        columns={columns}
        rows={logs.data?.data}
        rowKey={(e) => e.id}
        total={logs.data?.meta.total}
        page={table.page}
        pageSize={table.pageSize}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        sort={table.sort}
        onSortChange={table.setSort}
        loading={logs.isPending}
        fetching={logs.isFetching}
        error={logs.error}
        onRetry={() => void logs.refetch()}
        onRowClick={(e) => select(e.id)}
        toolbar={
          <Stack gap="sm">
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
              <SearchInput
                value={table.filters.q}
                onChange={(v) => table.setFilter('q', v)}
                placeholder={t('audit-log:filters.search')}
              />
              <SearchInput
                leftSection={null}
                aria-label={t('audit-log:filters.entity')}
                placeholder={t('audit-log:filters.entity')}
                dir="ltr"
                value={table.filters.entityType}
                onChange={(v) => table.setFilter('entityType', v)}
              />
              <SearchInput
                leftSection={null}
                aria-label={t('audit-log:filters.action')}
                placeholder={t('audit-log:filters.action')}
                dir="ltr"
                value={table.filters.action}
                onChange={(v) => table.setFilter('action', v)}
              />
              <DatePickerInput
                type="range"
                aria-label={t('audit-log:filters.dateRange')}
                placeholder={t('audit-log:filters.dateRange')}
                clearable
                allowSingleDateInRange
                value={[table.filters.from || null, table.filters.to || null]}
                onChange={([from, to]) =>
                  table.setFilters({
                    from: from ? String(from).slice(0, 10) : null,
                    to: to ? String(to).slice(0, 10) : null,
                  })
                }
              />
            </SimpleGrid>
            {table.filters.entityId || table.filters.actorId || hasFilters ? (
              <Group gap="xs">
                {table.filters.entityId ? (
                  <Text size="xs" c="dimmed">
                    {t('audit-log:filters.entityIdActive')}{' '}
                    <Code dir="ltr">{table.filters.entityId}</Code>
                  </Text>
                ) : null}
                {table.filters.actorId ? (
                  <Text size="xs" c="dimmed">
                    {t('audit-log:filters.actorIdActive')}{' '}
                    <Code dir="ltr">{table.filters.actorId}</Code>
                  </Text>
                ) : null}
                <Button
                  size="compact-xs"
                  variant="subtle"
                  leftSection={<IconFilterOff size={14} aria-hidden />}
                  onClick={table.resetFilters}
                >
                  {t('common:actions.resetFilters')}
                </Button>
              </Group>
            ) : null}
          </Stack>
        }
      />
      <AuditEntryDrawer
        entryId={selectedId}
        fallback={logs.data?.data.find((e) => e.id === selectedId)}
        onClose={() => select(null)}
      />
    </>
  );
}
