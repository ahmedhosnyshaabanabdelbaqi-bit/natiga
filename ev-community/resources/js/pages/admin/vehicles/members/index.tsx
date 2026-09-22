import { Head, Link, router, useForm } from '@inertiajs/react';
import { KeyRound, Search, X } from 'lucide-react';
import type { FormEvent } from 'react';
import type { DataTableColumn } from '@/components/shared/data-table';
import { DataTable } from '@/components/shared/data-table';
import { DateTime } from '@/components/shared/date-time';
import type { FilterDefinition } from '@/components/shared/filters-bar';
import { FiltersBar, useQueryState } from '@/components/shared/filters-bar';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { StatusBadge } from '@/components/shared/status-badge';
import type { StatusTone } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { GarageVehicleCard } from '@/features/garage/types';
import { VehiclesAdminNav } from '@/features/vehicles/admin-nav';
import type { Option } from '@/features/vehicles/types';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { index as makesIndex } from '@/routes/admin/vehicles';
import { index, show, vin_lookup } from '@/routes/admin/vehicles/members';
import type { Paginated } from '@/types/pagination';

type Row = GarageVehicleCard & {
    member: {
        id: string | null;
        member_number: string | null;
        name: string | null;
    };
};

type Props = {
    vehicles: Paginated<Row>;
    filters: {
        q: string;
        make: number | null;
        model: number | null;
        year: number | null;
        status: string | null;
        variant: string | null;
    };
    vinLookup: { active: boolean; matched: boolean } | null;
    makes: { id: number; name: string }[];
    models: { id: number; name: string }[];
    statuses: Option[];
};

function VinLookupForm() {
    const form = useForm({ vin: '' });
    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.post(vin_lookup().url, {
            preserveScroll: true,
            onSuccess: () => form.reset(),
        });
    };
    return (
        <form
            onSubmit={submit}
            className="flex flex-wrap items-end gap-2"
            noValidate
        >
            <FormField
                id="vin-lookup"
                label={t('vehicles.admin.members.vin_lookup')}
                hint={t('vehicles.hints.vin_lookup')}
                error={form.errors.vin}
                className="min-w-64 flex-1"
            >
                <Input
                    dir="ltr"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={24}
                    className="font-mono uppercase"
                    value={form.data.vin}
                    onChange={(event) =>
                        form.setData('vin', event.target.value)
                    }
                />
            </FormField>
            <Button
                type="submit"
                variant="outline"
                disabled={form.processing || form.data.vin.trim() === ''}
                className="mb-6"
            >
                {form.processing ? (
                    <Spinner />
                ) : (
                    <KeyRound className="size-4" aria-hidden="true" />
                )}
                {t('vehicles.admin.members.vin_lookup_submit')}
            </Button>
        </form>
    );
}

export default function AdminMemberVehicles({
    vehicles,
    filters,
    vinLookup,
    makes,
    models,
    statuses,
}: Props) {
    const query = useQueryState();

    const filterDefs: FilterDefinition[] = [
        {
            key: 'q',
            type: 'search',
            label: t('core.actions.search'),
            placeholder: t('vehicles.admin.members.search'),
            className: 'md:w-80',
        },
        {
            key: 'make',
            type: 'select',
            label: t('vehicles.fields.make'),
            options: makes.map((make) => ({
                value: String(make.id),
                label: make.name,
            })),
        },
        ...(filters.make
            ? [
                  {
                      key: 'model',
                      type: 'select' as const,
                      label: t('vehicles.fields.model'),
                      options: models.map((model) => ({
                          value: String(model.id),
                          label: model.name,
                      })),
                  },
              ]
            : []),
        {
            key: 'status',
            type: 'select',
            label: t('core.labels.status'),
            options: statuses,
        },
        {
            key: 'variant',
            type: 'select',
            label: t('vehicles.fields.variant'),
            options: [
                {
                    value: 'missing',
                    label: t('vehicles.admin.members.without_variant'),
                },
            ],
        },
    ];

    const columns: DataTableColumn<Row>[] = [
        {
            key: 'vehicle',
            header: t('core.labels.vehicle'),
            required: true,
            cell: (row) => (
                <div className="min-w-0">
                    <Link
                        href={show(row.id).url}
                        className="font-medium hover:underline"
                    >
                        {row.make.name} {row.model.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                        {row.variant?.name ??
                            t('vehicles.selector.unknown_variant')}{' '}
                        · {row.market_version.label}
                    </p>
                </div>
            ),
        },
        {
            key: 'year',
            header: t('vehicles.fields.year'),
            cell: (row) => <span className="tabular">{row.year}</span>,
        },
        {
            key: 'member',
            header: t('vehicles.fields.member'),
            cell: (row) => (
                <div className="min-w-0">
                    <p className="truncate">{row.member.name ?? '—'}</p>
                    {row.member.member_number ? (
                        <Code className="text-xs">
                            {row.member.member_number}
                        </Code>
                    ) : null}
                </div>
            ),
        },
        {
            key: 'status',
            header: t('core.labels.status'),
            cell: (row) => (
                <StatusBadge
                    status={row.status.value}
                    label={row.status.label}
                    tone={row.status.color as StatusTone}
                />
            ),
        },
        {
            key: 'odometer',
            header: t('vehicles.fields.odometer'),
            hideOnMobile: true,
            align: 'end',
            cell: (row) => (
                <span className="tabular">
                    {row.odometer_km !== null
                        ? formatNumber(row.odometer_km, 0)
                        : '—'}
                </span>
            ),
        },
        {
            key: 'has_vin',
            header: t('vehicles.admin.members.vin_on_file'),
            hideOnMobile: true,
            cell: (row) =>
                row.has_vin ? (
                    <Badge variant="secondary">{t('core.labels.yes')}</Badge>
                ) : (
                    <span className="text-muted-foreground">
                        {t('core.labels.no')}
                    </span>
                ),
        },
        {
            key: 'created_at',
            header: t('core.labels.created_at'),
            hideOnMobile: true,
            cell: (row) => <DateTime value={row.created_at} mode="date" />,
        },
    ];

    const filtered = Boolean(
        filters.q ||
        filters.make ||
        filters.model ||
        filters.year ||
        filters.status ||
        filters.variant,
    );

    return (
        <>
            <Head title={t('vehicles.admin.members.title')} />
            <div className="space-y-6">
                <PageHeader
                    title={t('vehicles.admin.title')}
                    description={t('vehicles.admin.members.description')}
                />
                <VehiclesAdminNav current="members" />
                <SectionCard>
                    <VinLookupForm />
                    {vinLookup?.active ? (
                        <InlineAlert
                            tone={vinLookup.matched ? 'info' : 'warning'}
                            icon={vinLookup.matched ? Search : null}
                            action={
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => router.get(index().url)}
                                >
                                    <X className="size-4" aria-hidden="true" />
                                    {t('vehicles.admin.members.clear_vin')}
                                </Button>
                            }
                        >
                            {vinLookup.matched
                                ? t('vehicles.admin.members.vin_match')
                                : t('vehicles.admin.members.vin_no_match')}
                        </InlineAlert>
                    ) : null}
                </SectionCard>
                <DataTable<Row>
                    id="admin-member-vehicles"
                    columns={columns}
                    data={vehicles}
                    rowKey="id"
                    rowHref={(row) => show(row.id).url}
                    toolbar={
                        vinLookup?.active ? undefined : (
                            <FiltersBar filters={filterDefs} />
                        )
                    }
                    filtered={filtered}
                    onResetFilters={() => query.reset()}
                    emptyTitle={t('vehicles.admin.members.empty')}
                    caption={t('vehicles.admin.members.title')}
                />
            </div>
        </>
    );
}

AdminMemberVehicles.layout = () => ({
    breadcrumbs: [
        { title: t('vehicles.admin.title'), href: makesIndex().url },
        { title: t('vehicles.admin.members.title'), href: index().url },
    ],
});
