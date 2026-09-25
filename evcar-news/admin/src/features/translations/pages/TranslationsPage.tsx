import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
  VisuallyHidden,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconInfoCircle, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '@/app/auth/usePermissions';
import { PERMISSIONS } from '@/app/permissions';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable, useTableState, type DataTableColumn } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { formatDateTime } from '@/lib/format';
import { translationsApi, translationsKeys, type TranslationOverride } from '../api';
import { AddTranslationModal, EditTranslationModal } from '../components/TranslationModals';

export default function TranslationsPage() {
  const { t, i18n } = useTranslation(['translations', 'common']);
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.translationsWrite);
  const table = useTableState({
    filters: ['q', 'namespace', 'locale'] as const,
    defaultSort: { field: 'namespace', direction: 'asc' },
  });
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: translationsKeys.list(table.query),
    queryFn: ({ signal }) => translationsApi.list(table.query, signal),
    placeholderData: (prev) => prev,
  });
  const remove = useMutation({
    mutationFn: (id: string) => translationsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: translationsKeys.all }),
    meta: { successMessage: 'translations:deleted' },
  });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TranslationOverride | null>(null);
  const [deleting, setDeleting] = useState<TranslationOverride | null>(null);

  const columns: DataTableColumn<TranslationOverride>[] = [
    {
      key: 'namespace',
      header: t('translations:fields.namespace'),
      sortable: true,
      render: (r) => <Code dir="ltr">{r.namespace}</Code>,
    },
    {
      key: 'key',
      header: t('translations:fields.key'),
      sortable: true,
      render: (r) => (
        <Text size="sm" ff="monospace" dir="ltr" ta="start" style={{ wordBreak: 'break-all' }}>
          {r.key}
        </Text>
      ),
    },
    {
      key: 'locale',
      header: t('translations:fields.locale'),
      sortable: true,
      render: (r) => (
        <Badge variant="light" color={r.locale === 'ar' ? 'grape' : 'blue'}>
          {t(`common:languages.${r.locale}`, { defaultValue: r.locale })}
        </Badge>
      ),
    },
    {
      key: 'value',
      header: t('translations:fields.value'),
      render: (r) => (
        <Text size="sm" dir={r.locale === 'ar' ? 'rtl' : 'ltr'} lang={r.locale} lineClamp={3}>
          {r.value}
        </Text>
      ),
    },
    {
      key: 'updatedAt',
      header: t('translations:fields.updatedAt'),
      sortable: true,
      visibleFrom: 'lg',
      render: (r) => <Text size="xs">{formatDateTime(r.updatedAt, i18n.language)}</Text>,
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: <VisuallyHidden>{t('common:actions.actions')}</VisuallyHidden>,
            align: 'end' as const,
            render: (r: TranslationOverride) => (
              <Group gap={4} justify="flex-end" wrap="nowrap">
                <Tooltip label={t('common:actions.edit')}>
                  <ActionIcon
                    variant="subtle"
                    aria-label={t('common:actions.edit')}
                    onClick={() => setEditing(r)}
                  >
                    <IconPencil size={16} aria-hidden />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={t('translations:delete')}>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={t('translations:delete')}
                    onClick={() => setDeleting(r)}
                  >
                    <IconTrash size={16} aria-hidden />
                  </ActionIcon>
                </Tooltip>
              </Group>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title={t('translations:title')}
        description={t('translations:description')}
        actions={
          canWrite ? (
            <Button
              leftSection={<IconPlus size={16} aria-hidden />}
              onClick={() => setAdding(true)}
            >
              {t('translations:add')}
            </Button>
          ) : null
        }
      />
      <Alert color="blue" variant="light" icon={<IconInfoCircle aria-hidden />} mb="md">
        {t('translations:note')}
      </Alert>
      <DataTable
        caption={t('translations:title')}
        columns={columns}
        rows={list.data?.data}
        rowKey={(r) => r.id}
        total={list.data?.meta.total}
        page={table.page}
        pageSize={table.pageSize}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        sort={table.sort}
        onSortChange={table.setSort}
        loading={list.isPending}
        fetching={list.isFetching}
        error={list.error}
        onRetry={() => void list.refetch()}
        toolbar={
          <Stack gap="sm">
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              <SearchInput
                value={table.filters.q}
                onChange={(v) => table.setFilter('q', v)}
                placeholder={t('translations:searchPlaceholder')}
              />
              <SearchInput
                leftSection={null}
                dir="ltr"
                aria-label={t('translations:fields.namespace')}
                placeholder={t('translations:fields.namespace')}
                value={table.filters.namespace}
                onChange={(v) => table.setFilter('namespace', v)}
              />
              <Select
                aria-label={t('translations:fields.locale')}
                placeholder={t('translations:anyLocale')}
                clearable
                data={[
                  { value: 'ar', label: t('common:languages.ar') },
                  { value: 'en', label: t('common:languages.en') },
                ]}
                value={table.filters.locale || null}
                onChange={(v) => table.setFilter('locale', v)}
              />
            </SimpleGrid>
          </Stack>
        }
      />
      {adding ? <AddTranslationModal opened onClose={() => setAdding(false)} /> : null}
      {editing ? (
        <EditTranslationModal key={editing.id} row={editing} onClose={() => setEditing(null)} />
      ) : null}
      <ConfirmDialog
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        danger
        title={t('translations:deleteTitle')}
        message={t('translations:deleteBody', {
          key: deleting ? `${deleting.namespace}:${deleting.key}` : '',
          locale: deleting?.locale ?? '',
        })}
        confirmLabel={t('translations:delete')}
        onConfirm={() => (deleting ? remove.mutateAsync(deleting.id) : undefined)}
      />
    </>
  );
}
