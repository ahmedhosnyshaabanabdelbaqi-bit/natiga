import {
  Box,
  Group,
  LoadingOverlay,
  Pagination,
  Paper,
  ScrollArea,
  Select,
  Table,
  Text,
  UnstyledButton,
  VisuallyHidden,
  type MantineBreakpoint,
} from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconSelector } from '@tabler/icons-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState } from '../StateViews';
import { PAGE_SIZE_OPTIONS, type SortState } from './tableState';

export interface DataTableColumn<T> {
  /** Unique key; used as the API sort field when `sortable`. */
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  /** Overrides `key` as the sort field sent to the API. */
  sortField?: string;
  width?: number | string;
  align?: 'start' | 'center' | 'end';
  visibleFrom?: MantineBreakpoint;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  /** Total number of rows on the server (meta.total). */
  total?: number | undefined;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  /** First load (no rows yet). */
  loading?: boolean;
  /** Background refetch (rows are shown dimmed). */
  fetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Accessible table label. */
  caption: string;
  toolbar?: ReactNode;
}

function nextSort(current: SortState | null | undefined, field: string): SortState | null {
  if (!current || current.field !== field) return { field, direction: 'asc' };
  if (current.direction === 'asc') return { field, direction: 'desc' };
  return null;
}

/** Server-driven table: pagination, sorting and filtering happen in the API. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  sort,
  onSortChange,
  loading = false,
  fetching = false,
  error,
  onRetry,
  empty,
  onRowClick,
  caption,
  toolbar,
}: DataTableProps<T>) {
  const { t, i18n } = useTranslation('common');
  const totalPages = total !== undefined ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = total !== undefined ? Math.min(total, page * pageSize) : 0;
  const fmt = new Intl.NumberFormat(i18n.language);

  const header = columns.map((col) => {
    const field = col.sortField ?? col.key;
    const active = sort?.field === field ? sort.direction : null;
    const ariaSort = active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none';
    return (
      <Table.Th
        key={col.key}
        w={col.width}
        ta={col.align}
        visibleFrom={col.visibleFrom}
        aria-sort={col.sortable ? ariaSort : undefined}
      >
        {col.sortable && onSortChange ? (
          <UnstyledButton
            onClick={() => onSortChange(nextSort(sort, field))}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}
          >
            {col.header}
            {active === 'asc' ? (
              <IconChevronUp size={14} aria-hidden />
            ) : active === 'desc' ? (
              <IconChevronDown size={14} aria-hidden />
            ) : (
              <IconSelector size={14} aria-hidden />
            )}
            <VisuallyHidden>
              {active ? t(`table.sorted.${active}`) : t('table.sortable')}
            </VisuallyHidden>
          </UnstyledButton>
        ) : (
          col.header
        )}
      </Table.Th>
    );
  });

  const onRowKeyDown = (event: KeyboardEvent, row: T) => {
    if (!onRowClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick(row);
    }
  };

  let body: ReactNode;
  if (error && !rows) {
    body = (
      <Table.Tr>
        <Table.Td colSpan={columns.length}>
          <ErrorState error={error} onRetry={onRetry} compact />
        </Table.Td>
      </Table.Tr>
    );
  } else if (!loading && rows && rows.length === 0) {
    body = (
      <Table.Tr>
        <Table.Td colSpan={columns.length}>{empty ?? <EmptyState />}</Table.Td>
      </Table.Tr>
    );
  } else {
    body = (rows ?? []).map((row) => (
      <Table.Tr
        key={rowKey(row)}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        onKeyDown={onRowClick ? (e) => onRowKeyDown(e, row) : undefined}
        tabIndex={onRowClick ? 0 : undefined}
        style={onRowClick ? { cursor: 'pointer' } : undefined}
      >
        {columns.map((col) => (
          <Table.Td key={col.key} ta={col.align} visibleFrom={col.visibleFrom}>
            {col.render(row)}
          </Table.Td>
        ))}
      </Table.Tr>
    ));
  }

  return (
    <Paper withBorder radius="md" p={0}>
      {toolbar ? (
        <Box p="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          {toolbar}
        </Box>
      ) : null}
      <Box pos="relative" mih={loading ? 160 : undefined}>
        <LoadingOverlay
          visible={loading || (fetching && !!rows)}
          zIndex={2}
          overlayProps={{ blur: 1 }}
        />
        <ScrollArea type="auto">
          <Table striped highlightOnHover={!!onRowClick} verticalSpacing="sm" miw={640}>
            <Table.Caption style={{ captionSide: 'top' }}>
              <VisuallyHidden>{caption}</VisuallyHidden>
            </Table.Caption>
            <Table.Thead>
              <Table.Tr>{header}</Table.Tr>
            </Table.Thead>
            <Table.Tbody>{body}</Table.Tbody>
          </Table>
        </ScrollArea>
      </Box>
      {error && rows ? (
        <Box px="sm">
          <ErrorState error={error} onRetry={onRetry} compact />
        </Box>
      ) : null}
      <Group justify="space-between" p="sm" wrap="wrap" gap="sm">
        <Text size="sm" c="dimmed" aria-live="polite">
          {total !== undefined
            ? t('table.range', {
                from: fmt.format(from),
                to: fmt.format(to),
                total: fmt.format(total),
              })
            : null}
        </Text>
        <Group gap="sm">
          {onPageSizeChange ? (
            <Select
              aria-label={t('table.pageSize')}
              size="xs"
              w={90}
              data={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
              value={String(pageSize)}
              onChange={(v) => v && onPageSizeChange(Number(v))}
              allowDeselect={false}
            />
          ) : null}
          <Pagination
            size="sm"
            total={totalPages}
            value={Math.min(page, totalPages)}
            onChange={onPageChange}
            getControlProps={(control) => ({
              'aria-label': t(`table.pagination.${control}`),
            })}
            getItemProps={(p) => ({ 'aria-label': t('table.pagination.page', { page: p }) })}
          />
        </Group>
      </Group>
    </Paper>
  );
}
