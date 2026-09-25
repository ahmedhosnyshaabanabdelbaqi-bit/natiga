import { Anchor, Badge, Group, Select, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core';
import { IconMailCheck, IconMailQuestion } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { DataTable, useTableState, type DataTableColumn } from '@/components/DataTable';
import { SearchInput } from '@/components/SearchInput';
import { formatDate, formatRelative } from '@/lib/format';
import { roleLabel, type AdminUser } from '../api';
import { useRoles, useUsersList } from '../hooks';
import { UserDrawer } from './UserDrawer';
import { UserStatusBadge } from './UserStatusBadge';

const USER_FILTERS = ['q', 'role', 'status'] as const;

export function UsersTab() {
  const { t, i18n } = useTranslation(['users', 'common']);
  const lang = i18n.language;
  const table = useTableState({
    filters: USER_FILTERS,
    defaultSort: { field: 'createdAt', direction: 'desc' },
  });
  const users = useUsersList(table.query);
  const roles = useRoles();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('user');

  const openUser = (id: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('user', id);
        else next.delete('user');
        return next;
      },
      { replace: false },
    );

  const roleByKey = new Map((roles.data ?? []).map((r) => [r.key, r]));

  const columns: DataTableColumn<AdminUser>[] = [
    {
      key: 'displayName',
      header: t('users:columns.user'),
      sortable: true,
      render: (u) => (
        <Stack gap={0}>
          <Group gap={6}>
            <Anchor
              component="button"
              type="button"
              fw={600}
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                openUser(u.id);
              }}
            >
              {u.displayName || u.email}
            </Anchor>
            {u.isDemo ? (
              <Badge size="xs" color="orange" variant="outline">
                {t('common:demo')}
              </Badge>
            ) : null}
          </Group>
          <Text size="xs" c="dimmed" dir="ltr" ta="start">
            {u.email}
          </Text>
        </Stack>
      ),
    },
    {
      key: 'roles',
      header: t('users:columns.roles'),
      render: (u) => (
        <Group gap={4}>
          {u.roles.length === 0 ? (
            <Text size="xs" c="dimmed">
              —
            </Text>
          ) : (
            u.roles.map((r) => (
              <Badge key={r} size="sm" variant="light" color={r === 'owner' ? 'grape' : 'brand'}>
                {roleLabel(roleByKey.get(r), lang, r)}
              </Badge>
            ))
          )}
        </Group>
      ),
    },
    {
      key: 'status',
      header: t('users:columns.status'),

      render: (u) => <UserStatusBadge status={u.status} />,
    },
    {
      key: 'emailVerified',
      header: t('users:columns.email'),
      visibleFrom: 'md',
      render: (u) => (
        <Tooltip label={t(u.emailVerified ? 'users:emailVerified' : 'users:emailNotVerified')}>
          <Group gap={4} wrap="nowrap">
            {u.emailVerified ? (
              <IconMailCheck size={18} color="var(--mantine-color-teal-6)" aria-hidden />
            ) : (
              <IconMailQuestion size={18} color="var(--mantine-color-gray-6)" aria-hidden />
            )}
            <Text size="xs">
              {t(u.emailVerified ? 'users:verifiedShort' : 'users:unverifiedShort')}
            </Text>
          </Group>
        </Tooltip>
      ),
    },
    {
      key: 'lastLoginAt',
      header: t('users:columns.lastLogin'),
      sortable: true,
      visibleFrom: 'lg',
      render: (u) =>
        u.lastLoginAt ? (
          <Tooltip label={formatDate(u.lastLoginAt, lang)}>
            <Text size="sm">{formatRelative(u.lastLoginAt, lang)}</Text>
          </Tooltip>
        ) : (
          <Text size="sm" c="dimmed">
            {t('users:never')}
          </Text>
        ),
    },
    {
      key: 'createdAt',
      header: t('users:columns.createdAt'),
      sortable: true,
      render: (u) => <Text size="sm">{formatDate(u.createdAt, lang)}</Text>,
    },
  ];

  return (
    <>
      <DataTable
        caption={t('users:tabs.users')}
        columns={columns}
        rows={users.data?.data}
        rowKey={(u) => u.id}
        total={users.data?.meta.total}
        page={table.page}
        pageSize={table.pageSize}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        sort={table.sort}
        onSortChange={table.setSort}
        loading={users.isPending}
        fetching={users.isFetching}
        error={users.error}
        onRetry={() => void users.refetch()}
        onRowClick={(u) => openUser(u.id)}
        toolbar={
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            <SearchInput
              value={table.filters.q}
              onChange={(v) => table.setFilter('q', v)}
              placeholder={t('users:filters.searchPlaceholder')}
            />
            <Select
              aria-label={t('users:filters.role')}
              placeholder={t('users:filters.anyRole')}
              clearable
              data={(roles.data ?? []).map((r) => ({ value: r.key, label: roleLabel(r, lang) }))}
              value={table.filters.role || null}
              onChange={(v) => table.setFilter('role', v)}
            />
            <Select
              aria-label={t('users:filters.status')}
              placeholder={t('users:filters.anyStatus')}
              clearable
              data={[
                { value: 'active', label: t('users:status.active') },
                { value: 'suspended', label: t('users:status.suspended') },
              ]}
              value={table.filters.status || null}
              onChange={(v) => table.setFilter('status', v)}
            />
          </SimpleGrid>
        }
      />
      <UserDrawer userId={selectedId} onClose={() => openUser(null)} />
    </>
  );
}
