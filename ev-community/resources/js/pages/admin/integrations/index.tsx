import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    Activity,
    AlertTriangle,
    CircleSlash,
    ExternalLink,
    Info,
    Mail,
    MapPin,
    Navigation,
    PlayCircle,
    RefreshCw,
    Webhook,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { CopyButton } from '@/components/shared/copy-button';
import type { DataTableColumn } from '@/components/shared/data-table';
import { DataTable } from '@/components/shared/data-table';
import { DateTime } from '@/components/shared/date-time';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { DescriptionList, SectionCard } from '@/components/shared/section-card';
import { StatCard } from '@/components/shared/stat-card';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import { Input } from '@/components/ui/input';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatNumber } from '@/lib/format';
import { t, useLocale } from '@/lib/i18n';
import {
    check,
    geocodeTest,
    index as integrationsIndex,
    testEmail,
} from '@/routes/admin/integrations';
import { index as webhookEventsIndex } from '@/routes/admin/integrations/webhook-events';
import {
    ConfiguredBadge,
    EventStatusBadge,
    HealthBadge,
} from '@/features/integrations/badges';
import { toastFirstError } from '@/features/integrations/errors';
import { IntegrationsTabs } from '@/features/integrations/integrations-tabs';
import { JsonBlock } from '@/features/integrations/json-block';
import type {
    GeocodeResult,
    IntegrationEventRow,
    IntegrationsIndexProps,
    MatrixRow,
    WebhookStatus,
} from '@/features/integrations/types';

const ALL = 'all';

function useCheckRunner() {
    const [running, setRunning] = useState<string | null>(null);
    const run = (key: string) => {
        router.post(
            check.url(key),
            {},
            {
                preserveScroll: true,
                onStart: () => setRunning(key),
                onFinish: () => setRunning(null),
                onError: toastFirstError,
            },
        );
    };
    return { running, run };
}

function SummaryCards({ matrix }: { matrix: MatrixRow[] }) {
    const count = (statuses: MatrixRow['status'][]) =>
        matrix.filter((row) => statuses.includes(row.status)).length;
    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
                label={t('integrations.health.operational')}
                value={formatNumber(count(['operational']))}
                icon={Activity}
                tone="success"
            />
            <StatCard
                label={t('integrations.summary.attention')}
                value={formatNumber(count(['degraded', 'unavailable']))}
                hint={t('integrations.summary.attention_hint')}
                icon={AlertTriangle}
                tone={
                    count(['degraded', 'unavailable']) > 0
                        ? 'warning'
                        : 'default'
                }
            />
            <StatCard
                label={t('integrations.health.not_configured')}
                value={formatNumber(count(['not_configured']))}
                hint={t('integrations.summary.not_configured_hint')}
                icon={CircleSlash}
            />
            <StatCard
                label={t('integrations.health.unknown')}
                value={formatNumber(count(['unknown']))}
                hint={t('integrations.summary.unknown_hint')}
                icon={Info}
            />
        </div>
    );
}

function docsAnchor(docs: string): string {
    const hash = docs.indexOf('#');
    return hash >= 0 ? docs.slice(hash) : docs;
}

function MatrixDetails({
    row,
    onOpenChange,
}: {
    row: MatrixRow | null;
    onOpenChange: (open: boolean) => void;
}) {
    const { isRtl } = useLocale();
    return (
        <Sheet open={row !== null} onOpenChange={onOpenChange}>
            <SheetContent
                side={isRtl ? 'left' : 'right'}
                className="w-full overflow-y-auto sm:max-w-lg"
            >
                {row ? (
                    <>
                        <SheetHeader className="border-b text-start">
                            <SheetTitle className="flex flex-wrap items-center gap-2 pe-6">
                                {row.name}
                                <HealthBadge status={row.status} />
                            </SheetTitle>
                            <SheetDescription>{row.fallback}</SheetDescription>
                        </SheetHeader>
                        <div className="space-y-6 px-4 pb-6">
                            {row.last_error ? (
                                <InlineAlert
                                    tone={
                                        row.status === 'not_configured'
                                            ? 'warning'
                                            : 'danger'
                                    }
                                    title={t('integrations.columns.last_error')}
                                >
                                    <span className="break-words whitespace-pre-line">
                                        {row.last_error}
                                    </span>
                                </InlineAlert>
                            ) : null}
                            <DescriptionList
                                items={[
                                    {
                                        label: t(
                                            'integrations.columns.category',
                                        ),
                                        value: row.key,
                                        type: 'code',
                                    },
                                    {
                                        label: t('integrations.columns.driver'),
                                        value: row.driver_label,
                                    },
                                    {
                                        label: t(
                                            'integrations.columns.configured',
                                        ),
                                        value: (
                                            <ConfiguredBadge
                                                configured={row.configured}
                                            />
                                        ),
                                    },
                                    {
                                        label: t(
                                            'integrations.columns.last_checked',
                                        ),
                                        value: row.last_checked_at,
                                        type: 'datetime',
                                    },
                                    {
                                        label: t(
                                            'integrations.columns.last_success',
                                        ),
                                        value: row.last_success_at,
                                        type: 'datetime',
                                    },
                                    {
                                        label: t(
                                            'integrations.columns.fallback',
                                        ),
                                        value: row.fallback,
                                        full: true,
                                    },
                                ]}
                            />

                            <section className="space-y-2">
                                <h3 className="text-sm font-medium">
                                    {t('integrations.columns.webhook_url')}
                                </h3>
                                {row.webhook_url ? (
                                    <div className="flex items-center gap-1">
                                        <Code className="min-w-0 truncate">
                                            {row.webhook_url}
                                        </Code>
                                        <CopyButton
                                            value={row.webhook_url}
                                            label={t(
                                                'integrations.actions.copy_url',
                                            )}
                                        />
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        {t('integrations.matrix.no_webhooks')}
                                    </p>
                                )}
                            </section>

                            <section className="space-y-2">
                                <h3 className="text-sm font-medium">
                                    {t('integrations.columns.env')}
                                </h3>
                                <ul className="flex flex-wrap gap-1.5">
                                    {row.env.map((name) => (
                                        <li key={name}>
                                            <Code>{name}</Code>
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-xs text-muted-foreground">
                                    {t('integrations.matrix.env_hint')}
                                </p>
                            </section>

                            <section className="space-y-2">
                                <h3 className="text-sm font-medium">
                                    {t('integrations.columns.docs')}
                                </h3>
                                <div className="flex items-center gap-1">
                                    <Code className="min-w-0 truncate">
                                        {row.docs}
                                    </Code>
                                    <CopyButton
                                        value={row.docs}
                                        label={t(
                                            'integrations.actions.copy_path',
                                        )}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {t('integrations.matrix.docs_hint')}
                                </p>
                            </section>

                            <section className="space-y-2">
                                <h3 className="text-sm font-medium">
                                    {t('integrations.matrix.public_config')}
                                </h3>
                                <JsonBlock
                                    value={row.public_config}
                                    label={t(
                                        'integrations.matrix.public_config',
                                    )}
                                />
                            </section>
                        </div>
                    </>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

function StatusMatrix({
    matrix,
    canManage,
    running,
    onRun,
}: {
    matrix: MatrixRow[];
    canManage: boolean;
    running: string | null;
    onRun: (key: string) => void;
}) {
    const [details, setDetails] = useState<MatrixRow | null>(null);

    const columns: DataTableColumn<MatrixRow>[] = [
        {
            key: 'integration',
            header: t('integrations.columns.integration'),
            required: true,
            cell: (row) => (
                <div className="min-w-36">
                    <p className="font-medium">{row.name}</p>
                    <Code className="mt-0.5 text-[0.75rem]">{row.key}</Code>
                </div>
            ),
        },
        {
            key: 'driver',
            header: t('integrations.columns.driver'),
            cell: (row) => (
                <div className="min-w-28 whitespace-normal">
                    <p>{row.driver_label}</p>
                    {row.driver.endsWith('✕') ? (
                        <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-warning">
                            <AlertTriangle
                                className="size-3.5"
                                aria-hidden="true"
                            />
                            {t('integrations.matrix.driver_refused', {
                                driver: row.driver.replace(/\s*✕$/u, ''),
                            })}
                        </p>
                    ) : null}
                </div>
            ),
        },
        {
            key: 'configured',
            header: t('integrations.columns.configured'),
            cell: (row) => <ConfiguredBadge configured={row.configured} />,
        },
        {
            key: 'status',
            header: t('integrations.columns.status'),
            required: true,
            cell: (row) => (
                <div className="space-y-1">
                    <HealthBadge status={row.status} />
                    <p className="text-xs text-muted-foreground">
                        {row.last_checked_at ? (
                            <DateTime
                                value={row.last_checked_at}
                                mode="relative"
                            />
                        ) : (
                            t('integrations.matrix.never_checked')
                        )}
                    </p>
                </div>
            ),
        },
        {
            key: 'last_success',
            header: t('integrations.columns.last_success'),
            hideOnMobile: true,
            cell: (row) => (
                <DateTime
                    value={row.last_success_at}
                    mode="relative"
                    className={
                        row.last_success_at
                            ? undefined
                            : 'text-muted-foreground'
                    }
                />
            ),
        },
        {
            key: 'last_error',
            header: t('integrations.columns.last_error'),
            className: 'whitespace-normal',
            cell: (row) =>
                row.last_error ? (
                    <p
                        className="line-clamp-2 max-w-xs text-xs break-words text-danger"
                        title={row.last_error}
                    >
                        {row.last_error}
                    </p>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            key: 'fallback',
            header: t('integrations.columns.fallback'),
            className: 'whitespace-normal',
            hideOnMobile: true,
            cell: (row) => (
                <p className="line-clamp-2 max-w-xs text-xs text-muted-foreground">
                    {row.fallback}
                </p>
            ),
        },
        {
            key: 'docs',
            header: t('integrations.columns.docs'),
            hideOnMobile: true,
            cell: (row) => (
                <div className="flex items-center gap-0.5">
                    <Code className="text-[0.75rem]" title={row.docs}>
                        {docsAnchor(row.docs)}
                    </Code>
                    <CopyButton
                        value={row.docs}
                        label={t('integrations.actions.copy_path')}
                        className="size-7"
                    />
                </div>
            ),
        },
        {
            key: 'actions',
            header: (
                <span className="sr-only">
                    {t('integrations.columns.actions')}
                </span>
            ),
            required: true,
            align: 'end',
            cell: (row) => (
                <div className="flex items-center justify-end gap-1">
                    {canManage ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={running !== null}
                            onClick={() => onRun(row.key)}
                            aria-label={t('integrations.matrix.run_check_for', {
                                integration: row.name,
                            })}
                        >
                            {running === row.key ? (
                                <Spinner />
                            ) : (
                                <PlayCircle aria-hidden="true" />
                            )}
                            {t('integrations.actions.run_check')}
                        </Button>
                    ) : null}
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetails(row)}
                        aria-label={t('integrations.matrix.details_for', {
                            integration: row.name,
                        })}
                    >
                        {t('core.actions.details')}
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <>
            <DataTable<MatrixRow>
                id="integrations-matrix"
                columns={columns}
                data={matrix}
                rowKey="key"
                loading={false}
                caption={t('integrations.matrix.title')}
                mobileTitle={(row) => (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>{row.name}</span>
                        <HealthBadge status={row.status} />
                    </div>
                )}
            />
            <MatrixDetails
                row={details}
                onOpenChange={(open) => {
                    if (!open) {
                        setDetails(null);
                    }
                }}
            />
        </>
    );
}

function EmailTool({ email }: { email: IntegrationsIndexProps['email'] }) {
    const [sending, setSending] = useState(false);
    const send = () =>
        router.post(
            testEmail.url(),
            {},
            {
                preserveScroll: true,
                onStart: () => setSending(true),
                onFinish: () => setSending(false),
                onError: toastFirstError,
            },
        );

    const button = (
        <Button
            type="button"
            onClick={send}
            disabled={!email.configured || sending}
        >
            {sending ? <Spinner /> : <Mail aria-hidden="true" />}
            {t('integrations.actions.send_test_email')}
        </Button>
    );

    return (
        <SectionCard
            title={t('integrations.tools.email_title')}
            description={
                email.configured
                    ? t('integrations.tools.email_hint_configured', {
                          mailer: email.mailer,
                      })
                    : null
            }
            actions={<ConfiguredBadge configured={email.configured} />}
        >
            <div className="space-y-4">
                {email.configured ? null : (
                    <InlineAlert
                        tone="warning"
                        title={t('integrations.health.not_configured')}
                    >
                        {t('integrations.tools.email_hint_not_configured', {
                            mailer: email.mailer,
                        })}
                    </InlineAlert>
                )}
                <p className="text-sm text-muted-foreground">
                    {t('integrations.tools.email_to_label')}{' '}
                    <span dir="ltr" className="font-medium text-foreground">
                        {email.to}
                    </span>
                </p>
                {email.configured ? (
                    button
                ) : (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span
                                tabIndex={0}
                                className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
                            >
                                {button}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>
                            {t('integrations.tools.email_disabled_hint')}
                        </TooltipContent>
                    </Tooltip>
                )}
                {email.configured ? (
                    <p className="text-xs text-muted-foreground">
                        {t('integrations.tools.email_result_hint')}
                    </p>
                ) : null}
            </div>
        </SectionCard>
    );
}

function GeocodeResultView({ result }: { result: GeocodeResult }) {
    if (!result.found || !result.result) {
        return (
            <InlineAlert tone="warning">
                {t('integrations.tools.geocode_no_result', {
                    address: result.address,
                })}
            </InlineAlert>
        );
    }
    const geo = result.result;
    return (
        <div className="space-y-3 rounded-lg border p-4">
            <h3 className="text-sm font-medium">
                {t('integrations.tools.geocode_result_title')}
            </h3>
            <DescriptionList
                items={[
                    {
                        label: t('integrations.map.address'),
                        value: result.address,
                        full: true,
                    },
                    {
                        label: t('integrations.map.display_name'),
                        value: geo.display_name,
                        full: true,
                    },
                    {
                        label: t('integrations.map.lat'),
                        value: String(geo.lat),
                        type: 'code',
                    },
                    {
                        label: t('integrations.map.lng'),
                        value: String(geo.lng),
                        type: 'code',
                    },
                    { label: t('integrations.map.city'), value: geo.city },
                    {
                        label: t('integrations.map.country'),
                        value: geo.country_code,
                        type: 'code',
                    },
                    {
                        label: t('integrations.map.source'),
                        value: geo.source,
                        type: 'code',
                    },
                ]}
            />
            <div className="flex flex-wrap gap-2">
                {result.directions_url ? (
                    <Button asChild variant="outline" size="sm">
                        <a
                            href={result.directions_url}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Navigation aria-hidden="true" />
                            {t('integrations.tools.directions')}
                            <ExternalLink
                                className="size-3.5 rtl:-scale-x-100"
                                aria-hidden="true"
                            />
                        </a>
                    </Button>
                ) : null}
                {result.geo_uri ? (
                    <Button asChild variant="outline" size="sm">
                        <a href={result.geo_uri}>
                            <MapPin aria-hidden="true" />
                            {t('integrations.tools.open_geo')}
                        </a>
                    </Button>
                ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
                {t('integrations.tools.straight_line_note')}
            </p>
        </div>
    );
}

function GeocodeTool({
    map,
    geocodeResult,
}: {
    map: IntegrationsIndexProps['map'];
    geocodeResult: GeocodeResult | null;
}) {
    const form = useForm({ address: geocodeResult?.address ?? '' });
    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.post(geocodeTest.url(), {
            preserveScroll: true,
            onError: (errors) => {
                if (!errors.address) {
                    toastFirstError(errors);
                }
            },
        });
    };

    return (
        <SectionCard
            title={t('integrations.tools.geocode_title')}
            description={
                map.configured ? t('integrations.tools.geocode_hint') : null
            }
            actions={<ConfiguredBadge configured={map.configured} />}
        >
            {map.configured ? (
                <div className="space-y-4">
                    <form
                        onSubmit={submit}
                        className="flex flex-col gap-3 sm:flex-row sm:items-start"
                        noValidate
                    >
                        <FormField
                            label={t('integrations.map.address')}
                            error={form.errors.address}
                            required
                            className="flex-1"
                        >
                            <Input
                                name="address"
                                value={form.data.address}
                                onChange={(event) =>
                                    form.setData('address', event.target.value)
                                }
                                placeholder={t(
                                    'integrations.map.address_placeholder',
                                )}
                                minLength={3}
                                maxLength={200}
                                autoComplete="off"
                            />
                        </FormField>
                        <Button
                            type="submit"
                            disabled={form.processing}
                            className="sm:mt-[1.375rem]"
                        >
                            {form.processing ? (
                                <Spinner />
                            ) : (
                                <MapPin aria-hidden="true" />
                            )}
                            {t('integrations.actions.geocode_test')}
                        </Button>
                    </form>
                    {geocodeResult ? (
                        <GeocodeResultView result={geocodeResult} />
                    ) : null}
                </div>
            ) : (
                <InlineAlert
                    tone="warning"
                    title={t('integrations.health.not_configured')}
                >
                    {t('integrations.tools.not_available')}
                </InlineAlert>
            )}
        </SectionCard>
    );
}

const WEBHOOK_ORDER: WebhookStatus[] = [
    'failed',
    'received',
    'processing',
    'processed',
    'ignored',
];

function WebhookSummary({
    summary,
}: {
    summary: IntegrationsIndexProps['webhookSummary'];
}) {
    const total = WEBHOOK_ORDER.reduce(
        (sum, status) => sum + (summary[status] ?? 0),
        0,
    );
    return (
        <SectionCard
            title={t('integrations.webhooks.summary')}
            description={t('integrations.webhooks.summary_hint')}
            actions={
                <Button asChild variant="outline" size="sm">
                    <Link href={webhookEventsIndex.url()} prefetch>
                        <Webhook aria-hidden="true" />
                        {t('integrations.webhooks.view_all')}
                    </Link>
                </Button>
            }
        >
            {total === 0 ? (
                <p className="text-sm text-muted-foreground">
                    {t('integrations.webhooks.empty')}
                </p>
            ) : (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {WEBHOOK_ORDER.map((status) => (
                        <li key={status}>
                            <Link
                                href={webhookEventsIndex.url({
                                    query: { status },
                                })}
                                className="flex flex-col rounded-lg border p-3 transition outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/60"
                            >
                                <span className="text-xs text-muted-foreground">
                                    {t(
                                        `integrations.webhooks.status.${status}`,
                                    )}
                                </span>
                                <span
                                    className={
                                        status === 'failed' &&
                                        (summary[status] ?? 0) > 0
                                            ? 'tabular text-lg font-semibold text-danger'
                                            : 'tabular text-lg font-semibold'
                                    }
                                >
                                    {formatNumber(summary[status] ?? 0)}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </SectionCard>
    );
}

function RecentActivity({ events }: { events: IntegrationEventRow[] }) {
    const columns: DataTableColumn<IntegrationEventRow>[] = [
        {
            key: 'time',
            header: t('integrations.events.columns.time'),
            cell: (row) => <DateTime value={row.created_at} mode="relative" />,
        },
        {
            key: 'provider',
            header: t('integrations.events.columns.provider'),
            cell: (row) => t(`integrations.categories.${row.provider}`),
        },
        {
            key: 'direction',
            header: t('integrations.events.columns.direction'),
            hideOnMobile: true,
            cell: (row) => t(`integrations.events.direction.${row.direction}`),
        },
        {
            key: 'operation',
            header: t('integrations.events.columns.operation'),
            cell: (row) => <Code>{row.operation}</Code>,
        },
        {
            key: 'reference',
            header: t('integrations.events.columns.reference'),
            hideOnMobile: true,
            defaultHidden: true,
            cell: (row) =>
                row.reference ? (
                    <Code className="max-w-48 truncate align-bottom">
                        {row.reference}
                    </Code>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            key: 'status',
            header: t('integrations.events.columns.status'),
            cell: (row) => <EventStatusBadge status={row.status} />,
        },
        {
            key: 'duration',
            header: t('integrations.events.columns.duration'),
            align: 'end',
            hideOnMobile: true,
            cell: (row) =>
                row.duration_ms === null ? (
                    <span className="text-muted-foreground">—</span>
                ) : (
                    <span className="tabular">
                        {t('integrations.events.duration_ms', {
                            ms: formatNumber(row.duration_ms, 0),
                        })}
                    </span>
                ),
        },
        {
            key: 'error',
            header: t('integrations.events.columns.error'),
            className: 'whitespace-normal',
            cell: (row) =>
                row.error ? (
                    <p
                        className="line-clamp-2 max-w-sm text-xs break-words text-danger"
                        title={row.error}
                    >
                        {row.error}
                    </p>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
    ];

    return (
        <SectionCard
            title={t('integrations.events.title')}
            description={t('integrations.events.description')}
        >
            <DataTable<IntegrationEventRow>
                id="integrations-activity"
                columns={columns}
                data={events}
                rowKey="id"
                loading={false}
                dense
                caption={t('integrations.events.title')}
                emptyState={
                    <EmptyState
                        icon={Activity}
                        title={t('integrations.events.empty')}
                    />
                }
            />
        </SectionCard>
    );
}

export default function IntegrationsIndex({
    matrix,
    recentEvents,
    webhookSummary,
    email,
    map,
    geocodeResult,
    canManage,
}: IntegrationsIndexProps) {
    const { running, run } = useCheckRunner();

    return (
        <>
            <Head title={t('integrations.title')} />
            <div className="space-y-6">
                <PageHeader
                    title={t('integrations.title')}
                    description={t('integrations.description')}
                    actions={
                        canManage ? (
                            <Button
                                type="button"
                                onClick={() => run(ALL)}
                                disabled={running !== null}
                            >
                                {running === ALL ? (
                                    <Spinner />
                                ) : (
                                    <RefreshCw aria-hidden="true" />
                                )}
                                {t('integrations.actions.run_all_checks')}
                            </Button>
                        ) : null
                    }
                />
                <IntegrationsTabs current="status" />

                <SummaryCards matrix={matrix} />

                <section
                    aria-labelledby="integrations-matrix-title"
                    className="space-y-3"
                >
                    <div>
                        <h2
                            id="integrations-matrix-title"
                            className="text-base font-semibold"
                        >
                            {t('integrations.matrix.title')}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {t('integrations.matrix.description')}
                        </p>
                    </div>
                    <StatusMatrix
                        matrix={matrix}
                        canManage={canManage}
                        running={running}
                        onRun={run}
                    />
                </section>

                {canManage ? (
                    <section
                        aria-labelledby="integrations-tools-title"
                        className="space-y-3"
                    >
                        <h2
                            id="integrations-tools-title"
                            className="text-base font-semibold"
                        >
                            {t('integrations.tools.title')}
                        </h2>
                        <div className="grid gap-4 lg:grid-cols-2">
                            <EmailTool email={email} />
                            <GeocodeTool
                                map={map}
                                geocodeResult={geocodeResult}
                            />
                        </div>
                    </section>
                ) : null}

                <WebhookSummary summary={webhookSummary} />
                <RecentActivity events={recentEvents} />
            </div>
        </>
    );
}

IntegrationsIndex.layout = () => ({
    breadcrumbs: [
        { title: t('integrations.title'), href: integrationsIndex.url() },
    ],
});
