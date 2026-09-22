import { Head, Link } from '@inertiajs/react';
import { Pencil } from 'lucide-react';
import type { DataTableColumn } from '@/components/shared/data-table';
import { DataTable } from '@/components/shared/data-table';
import { DateTime } from '@/components/shared/date-time';
import type { FilterDefinition } from '@/components/shared/filters-bar';
import { FiltersBar, useQueryState } from '@/components/shared/filters-bar';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import { AdminNotificationsNav } from '@/features/notifications/admin-nav';
import type { Option, TemplateRow } from '@/features/notifications/types';
import { t } from '@/lib/i18n';
import { edit, index } from '@/routes/admin/notifications/templates';

type Props = {
    templates: TemplateRow[];
    modules: Option[];
    filters: { search?: string; module?: string; state?: string };
    canManage: boolean;
};

export default function EmailTemplatesIndex({
    templates,
    modules,
    filters,
    canManage,
}: Props) {
    const query = useQueryState();
    const filterDefinitions: FilterDefinition[] = [
        {
            key: 'search',
            type: 'search',
            label: t('notifications.email_templates.filters.search'),
            placeholder: t('notifications.email_templates.filters.search'),
        },
        {
            key: 'module',
            type: 'select',
            label: t('notifications.email_templates.filters.module'),
            options: modules,
        },
        {
            key: 'state',
            type: 'select',
            label: t('notifications.email_templates.filters.state'),
            options: [
                {
                    value: 'customized',
                    label: t('notifications.email_templates.customized'),
                },
                {
                    value: 'default',
                    label: t('notifications.email_templates.default'),
                },
            ],
        },
    ];

    const columns: DataTableColumn<TemplateRow>[] = [
        {
            key: 'key',
            header: t('notifications.email_templates.key'),
            required: true,
            cell: (row) => <Code>{row.key}</Code>,
        },
        {
            key: 'module',
            header: t('notifications.email_templates.module'),
            cell: (row) => row.module_label,
        },
        {
            key: 'subject',
            header: t('notifications.email_templates.subject'),
            cell: (row) => (
                <span className="line-clamp-2 max-w-md text-sm">
                    {row.subject || '—'}
                </span>
            ),
        },
        {
            key: 'state',
            header: t('notifications.email_templates.state'),
            cell: (row) =>
                row.customized ? (
                    <div className="space-y-0.5">
                        <StatusBadge
                            status="customized"
                            label={t(
                                'notifications.email_templates.customized',
                            )}
                            tone="brand"
                        />
                        {row.updated_at ? (
                            <div className="text-xs text-muted-foreground">
                                <DateTime
                                    value={row.updated_at}
                                    mode="relative"
                                />
                                {row.updated_by ? ` · ${row.updated_by}` : null}
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <StatusBadge
                        status="default"
                        label={t('notifications.email_templates.default')}
                        tone="muted"
                    />
                ),
        },
        {
            key: 'actions',
            header: <span className="sr-only">{t('core.labels.actions')}</span>,
            align: 'end',
            cell: (row) =>
                canManage ? (
                    <Button variant="outline" size="sm" asChild>
                        <Link href={edit.url({ key: row.key })}>
                            <Pencil aria-hidden="true" />
                            {t('notifications.email_templates.edit')}
                        </Link>
                    </Button>
                ) : null,
        },
    ];

    return (
        <>
            <Head title={t('notifications.email_templates.title')} />
            <div className="space-y-4">
                <PageHeader
                    title={t('notifications.email_templates.title')}
                    description={t('notifications.email_templates.description')}
                />
                <AdminNotificationsNav current="templates" />
                {!canManage ? (
                    <InlineAlert tone="info">
                        {t('notifications.email_templates.read_only')}
                    </InlineAlert>
                ) : null}
                <DataTable
                    id="admin-notification-templates"
                    columns={columns}
                    data={templates}
                    rowKey="key"
                    rowHref={
                        canManage
                            ? (row) => edit.url({ key: row.key })
                            : undefined
                    }
                    toolbar={<FiltersBar filters={filterDefinitions} />}
                    filtered={Boolean(
                        filters.search || filters.module || filters.state,
                    )}
                    onResetFilters={() => query.reset()}
                    emptyTitle={t('notifications.email_templates.empty')}
                    caption={t('notifications.email_templates.title')}
                    mobileTitle={(row) => <Code>{row.key}</Code>}
                />
            </div>
        </>
    );
}

EmailTemplatesIndex.layout = () => ({
    breadcrumbs: [
        { title: t('notifications.email_templates.title'), href: index.url() },
    ],
});
