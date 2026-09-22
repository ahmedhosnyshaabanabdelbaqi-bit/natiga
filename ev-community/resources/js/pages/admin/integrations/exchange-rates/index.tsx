import { Head, router, useForm } from '@inertiajs/react';
import { ArrowRightLeft, CalendarClock, Plus, RefreshCw } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import type { DataTableColumn } from '@/components/shared/data-table';
import { DataTable } from '@/components/shared/data-table';
import { DateTime } from '@/components/shared/date-time';
import { EmptyState } from '@/components/shared/empty-state';
import type {
    FilterDefinition,
    FilterValues,
} from '@/components/shared/filters-bar';
import { FiltersBar } from '@/components/shared/filters-bar';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { useQueryState } from '@/components/shared/use-query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Code } from '@/components/ui/code';
import { DateInput } from '@/components/ui/date-input';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { can } from '@/lib/auth';
import { boot, t } from '@/lib/i18n';
import { index as integrationsIndex } from '@/routes/admin/integrations';
import {
    index as exchangeRatesIndex,
    store,
    sync,
} from '@/routes/admin/integrations/exchange-rates';
import type { Auth } from '@/types/auth';
import { toastFirstError } from '@/features/integrations/errors';
import { IntegrationsTabs } from '@/features/integrations/integrations-tabs';
import type {
    Currency,
    ExchangeRateRow,
    ExchangeRatesIndexProps,
    LatestRate,
} from '@/features/integrations/types';
import { useListLoading } from '@/features/integrations/use-list-loading';

const FILTER_KEYS = ['base', 'source'] as const;

/** Today's date (YYYY-MM-DD) in the platform timezone (Africa/Cairo), matching the server's "today". */
function todayInPlatformTimezone(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: boot().timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
}

function SourceLabel({ source }: { source: string | null }) {
    if (!source) {
        return <span className="text-muted-foreground">—</span>;
    }
    if (source === 'manual') {
        return <span>{t('integrations.exchange_rates.sources.manual')}</span>;
    }
    if (source.startsWith('manual:correction:')) {
        return (
            <span className="inline-flex flex-wrap items-center gap-1">
                {t('integrations.exchange_rates.sources.correction')}
                <Code className="text-[0.75rem]">
                    #{source.slice('manual:correction:'.length)}
                </Code>
            </span>
        );
    }
    if (source.startsWith('provider:')) {
        return (
            <span className="inline-flex flex-wrap items-center gap-1">
                {t('integrations.exchange_rates.sources.provider')}
                <Code className="text-[0.75rem]">
                    {source.slice('provider:'.length)}
                </Code>
            </span>
        );
    }
    return <Code>{source}</Code>;
}

function RateEquation({
    base,
    quote,
    rate,
}: {
    base: string;
    quote: string;
    rate: string;
}) {
    return (
        <span dir="ltr" className="tabular">
            1 {base} = {rate} {quote}
        </span>
    );
}

function LatestCards({
    latest,
    baseCurrency,
}: {
    latest: LatestRate[];
    baseCurrency: string;
}) {
    return (
        <section aria-labelledby="fx-latest-title" className="space-y-3">
            <div>
                <h2 id="fx-latest-title" className="text-base font-semibold">
                    {t('integrations.exchange_rates.latest_title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                    {t('integrations.exchange_rates.latest_description', {
                        base: baseCurrency,
                    })}
                </p>
            </div>
            {latest.length === 0 ? (
                <EmptyState
                    icon={ArrowRightLeft}
                    title={t('integrations.exchange_rates.no_currencies')}
                />
            ) : (
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {latest.map((item) => (
                        <li key={item.currency}>
                            <Card className="h-full py-0 shadow-card">
                                <CardContent className="space-y-2 p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <Code>{item.currency}</Code>
                                            <p className="mt-1 truncate text-xs text-muted-foreground">
                                                {item.name}
                                            </p>
                                        </div>
                                        {item.rate !== null && item.stale ? (
                                            <StatusBadge
                                                status="stale"
                                                tone="warning"
                                                label={t(
                                                    'integrations.exchange_rates.stale_badge',
                                                )}
                                                className="normal-case"
                                            />
                                        ) : null}
                                    </div>
                                    {item.rate !== null ? (
                                        <>
                                            <p className="text-lg font-semibold">
                                                <RateEquation
                                                    base={item.currency}
                                                    quote={baseCurrency}
                                                    rate={item.rate}
                                                />
                                            </p>
                                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                                <CalendarClock
                                                    className="size-3.5"
                                                    aria-hidden="true"
                                                />
                                                <DateTime
                                                    value={item.rate_date}
                                                    mode="date"
                                                />
                                                <span aria-hidden="true">
                                                    ·
                                                </span>
                                                <SourceLabel
                                                    source={item.source}
                                                />
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            {t(
                                                'integrations.exchange_rates.no_rate',
                                            )}
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function CurrencySelect({
    id,
    value,
    onChange,
    currencies,
    invalid,
    describedBy,
}: {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    currencies: Currency[];
    invalid?: boolean;
    describedBy?: string;
}) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger
                id={id}
                className="w-full"
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
            >
                <SelectValue placeholder={t('core.actions.select')} />
            </SelectTrigger>
            <SelectContent>
                {currencies.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                        <span dir="ltr" className="font-mono">
                            {currency.code}
                        </span>
                        <span className="text-muted-foreground">
                            {currency.name}
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function AddRateForm({
    currencies,
    baseCurrency,
}: {
    currencies: Currency[];
    baseCurrency: string;
}) {
    // The platform currency is never the foreign (base) side of a rate; the server enforces it too.
    const foreignCurrencies = currencies.filter(
        (currency) => currency.code !== baseCurrency,
    );
    const defaultForeign = foreignCurrencies[0]?.code ?? '';
    const today = todayInPlatformTimezone();
    const form = useForm({
        base_currency: defaultForeign,
        quote_currency: baseCurrency,
        rate: '',
        rate_date: today,
        reason: '',
        correction: false,
    });
    const domainError = (form.errors as Record<string, string | undefined>)
        .domain;

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.clearErrors();
        form.post(store.url(), {
            preserveScroll: true,
            onSuccess: () => form.reset('rate', 'reason', 'correction'),
        });
    };

    return (
        <SectionCard
            title={t('integrations.exchange_rates.form.title')}
            description={t('integrations.exchange_rates.form.description')}
        >
            <form onSubmit={submit} className="space-y-4" noValidate>
                {domainError ? (
                    <InlineAlert tone="danger">{domainError}</InlineAlert>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label={t(
                            'integrations.exchange_rates.form.base_currency',
                        )}
                        error={form.errors.base_currency}
                        required
                    >
                        {(control) => (
                            <CurrencySelect
                                id={control.id}
                                value={form.data.base_currency}
                                onChange={(value) =>
                                    form.setData('base_currency', value)
                                }
                                currencies={foreignCurrencies}
                                invalid={control['aria-invalid']}
                                describedBy={control['aria-describedby']}
                            />
                        )}
                    </FormField>
                    <FormField
                        label={t(
                            'integrations.exchange_rates.form.quote_currency',
                        )}
                        error={form.errors.quote_currency}
                        required
                    >
                        {(control) => (
                            <CurrencySelect
                                id={control.id}
                                value={form.data.quote_currency}
                                onChange={(value) =>
                                    form.setData('quote_currency', value)
                                }
                                currencies={currencies}
                                invalid={control['aria-invalid']}
                                describedBy={control['aria-describedby']}
                            />
                        )}
                    </FormField>
                    <FormField
                        label={t('integrations.exchange_rates.form.rate')}
                        error={form.errors.rate}
                        hint={t('integrations.exchange_rates.form.rate_hint', {
                            base: form.data.base_currency || '—',
                            quote: form.data.quote_currency || '—',
                        })}
                        required
                    >
                        <Input
                            name="rate"
                            dir="ltr"
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="48.50"
                            value={form.data.rate}
                            onChange={(event) =>
                                form.setData('rate', event.target.value)
                            }
                            className="tabular"
                        />
                    </FormField>
                    <FormField
                        label={t('integrations.exchange_rates.form.rate_date')}
                        error={form.errors.rate_date}
                        required
                    >
                        <DateInput
                            name="rate_date"
                            value={form.data.rate_date}
                            max={today}
                            onChange={(event) =>
                                form.setData('rate_date', event.target.value)
                            }
                        />
                    </FormField>
                </div>
                <FormField
                    label={t('integrations.exchange_rates.form.correction')}
                    hint={t('integrations.exchange_rates.form.correction_hint')}
                    error={form.errors.correction}
                    inline
                >
                    <Checkbox
                        checked={form.data.correction}
                        onCheckedChange={(checked) =>
                            form.setData('correction', checked === true)
                        }
                    />
                </FormField>
                <FormField
                    label={t('integrations.exchange_rates.form.reason')}
                    error={form.errors.reason}
                    hint={t('integrations.exchange_rates.form.reason_hint')}
                    required
                >
                    <Textarea
                        name="reason"
                        rows={2}
                        maxLength={500}
                        placeholder={t(
                            'integrations.exchange_rates.form.reason_placeholder',
                        )}
                        value={form.data.reason}
                        onChange={(event) =>
                            form.setData('reason', event.target.value)
                        }
                    />
                </FormField>
                {form.data.rate.trim() !== '' &&
                form.data.base_currency &&
                form.data.quote_currency ? (
                    <p className="text-sm text-muted-foreground">
                        {t('integrations.exchange_rates.form.preview')}{' '}
                        <RateEquation
                            base={form.data.base_currency}
                            quote={form.data.quote_currency}
                            rate={form.data.rate.trim()}
                        />
                    </p>
                ) : null}
                <div className="flex justify-end">
                    <Button type="submit" disabled={form.processing}>
                        {form.processing ? (
                            <Spinner />
                        ) : (
                            <Plus aria-hidden="true" />
                        )}
                        {t('integrations.exchange_rates.form.submit')}
                    </Button>
                </div>
            </form>
        </SectionCard>
    );
}

function ProviderCard({
    provider,
    canManage,
}: {
    provider: ExchangeRatesIndexProps['provider'];
    canManage: boolean;
}) {
    const [syncing, setSyncing] = useState(false);
    const runSync = () =>
        router.post(
            sync.url(),
            {},
            {
                preserveScroll: true,
                onStart: () => setSyncing(true),
                onFinish: () => setSyncing(false),
                onError: toastFirstError,
            },
        );

    return (
        <SectionCard
            title={t('integrations.exchange_rates.sync_title')}
            description={
                provider.supports_sync
                    ? t('integrations.exchange_rates.sync_hint_provider', {
                          driver: provider.driver,
                      })
                    : t('integrations.exchange_rates.sync_hint_manual', {
                          driver: provider.driver,
                      })
            }
            actions={
                canManage && provider.supports_sync ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={runSync}
                        disabled={syncing}
                    >
                        {syncing ? (
                            <Spinner />
                        ) : (
                            <RefreshCw aria-hidden="true" />
                        )}
                        {t('integrations.actions.sync_rates')}
                    </Button>
                ) : null
            }
        >
            <p className="text-sm">
                {t('integrations.columns.driver')}:{' '}
                <Code>{provider.driver}</Code>
            </p>
            {!provider.configured ? (
                <InlineAlert tone="warning" className="mt-3">
                    {t('integrations.exchange_rates.provider_not_configured')}
                </InlineAlert>
            ) : null}
        </SectionCard>
    );
}

function RateHistory({
    rates,
    currencies,
    filters,
}: {
    rates: ExchangeRatesIndexProps['rates'];
    currencies: Currency[];
    filters: ExchangeRatesIndexProps['filters'];
}) {
    const query = useQueryState();
    const loading = useListLoading();

    const filterDefinitions: FilterDefinition[] = [
        {
            key: 'base',
            type: 'select',
            label: t('integrations.exchange_rates.filters.base'),
            options: currencies
                .filter((currency) => !currency.is_base)
                .map((currency) => ({
                    value: currency.code,
                    label: `${currency.code} — ${currency.name}`,
                })),
        },
        {
            key: 'source',
            type: 'select',
            label: t('integrations.exchange_rates.filters.source'),
            options: [
                {
                    value: 'manual',
                    label: t('integrations.exchange_rates.sources.manual'),
                },
                {
                    value: 'provider',
                    label: t('integrations.exchange_rates.sources.provider'),
                },
            ],
        },
    ];
    const values: FilterValues = {
        base: filters.base ?? undefined,
        source: filters.source ?? undefined,
    };
    const filtered = FILTER_KEYS.some((key) => Boolean(filters[key]));
    const applyFilters = (next: FilterValues) => {
        const changes: Record<string, string | null> = {};
        for (const key of FILTER_KEYS) {
            const value = next[key];
            changes[key] =
                typeof value === 'string' && value !== '' ? value : null;
        }
        query.patch(changes);
    };

    const columns: DataTableColumn<ExchangeRateRow>[] = [
        {
            key: 'rate_date',
            header: t('integrations.exchange_rates.columns.date'),
            cell: (row) => <DateTime value={row.rate_date} mode="date" />,
        },
        {
            key: 'pair',
            header: t('integrations.exchange_rates.columns.pair'),
            required: true,
            cell: (row) => (
                <Code>
                    {row.base_currency}/{row.quote_currency}
                </Code>
            ),
        },
        {
            key: 'rate',
            header: t('integrations.exchange_rates.columns.rate'),
            required: true,
            align: 'end',
            cell: (row) => (
                <span
                    dir="ltr"
                    className="tabular font-medium"
                    title={row.rate_raw}
                >
                    {row.rate}
                </span>
            ),
        },
        {
            key: 'source',
            header: t('integrations.exchange_rates.columns.source'),
            cell: (row) => <SourceLabel source={row.source} />,
        },
        {
            key: 'source_reference',
            header: t('integrations.exchange_rates.columns.reference'),
            defaultHidden: true,
            hideOnMobile: true,
            cell: (row) =>
                row.source_reference ? (
                    <Code className="max-w-48 truncate align-bottom">
                        {row.source_reference}
                    </Code>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            key: 'reason',
            header: t('integrations.exchange_rates.columns.reason'),
            className: 'whitespace-normal',
            cell: (row) =>
                row.reason ? (
                    <p
                        className="line-clamp-2 max-w-xs text-sm"
                        title={row.reason}
                    >
                        {row.reason}
                    </p>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            key: 'entered_by',
            header: t('integrations.exchange_rates.columns.entered_by'),
            hideOnMobile: true,
            cell: (row) =>
                row.entered_by ?? (
                    <span className="text-muted-foreground">
                        {t('integrations.exchange_rates.system_entry')}
                    </span>
                ),
        },
        {
            key: 'created_at',
            header: t('integrations.exchange_rates.columns.created_at'),
            defaultHidden: true,
            hideOnMobile: true,
            cell: (row) => <DateTime value={row.created_at} />,
        },
    ];

    return (
        <section aria-labelledby="fx-history-title" className="space-y-3">
            <div>
                <h2 id="fx-history-title" className="text-base font-semibold">
                    {t('integrations.exchange_rates.history_title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                    {t('integrations.exchange_rates.append_only_note')}
                </p>
            </div>
            <DataTable<ExchangeRateRow>
                id="integrations-exchange-rates"
                columns={columns}
                data={rates}
                rowKey="id"
                loading={loading}
                filtered={filtered}
                onResetFilters={() => applyFilters({})}
                caption={t('integrations.exchange_rates.history_title')}
                emptyState={
                    filtered ? undefined : (
                        <EmptyState
                            icon={ArrowRightLeft}
                            title={t('integrations.exchange_rates.empty')}
                        />
                    )
                }
                toolbar={
                    <FiltersBar
                        filters={filterDefinitions}
                        values={values}
                        onChange={applyFilters}
                        className="w-full"
                    />
                }
                mobileTitle={(row) => (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <RateEquation
                            base={row.base_currency}
                            quote={row.quote_currency}
                            rate={row.rate}
                        />
                        <DateTime
                            value={row.rate_date}
                            mode="date"
                            className="text-sm font-normal text-muted-foreground"
                        />
                    </div>
                )}
            />
        </section>
    );
}

export default function ExchangeRatesIndex({
    baseCurrency,
    currencies,
    latest,
    rates,
    filters,
    provider,
    canManage,
}: ExchangeRatesIndexProps) {
    return (
        <>
            <Head title={t('integrations.exchange_rates.title')} />
            <div className="space-y-6">
                <PageHeader
                    title={t('integrations.exchange_rates.title')}
                    description={t('integrations.exchange_rates.description')}
                />
                <IntegrationsTabs current="exchange_rates" />

                <InlineAlert
                    tone="info"
                    title={t('integrations.exchange_rates.convention_title')}
                >
                    {t('integrations.exchange_rates.convention_hint', {
                        base: baseCurrency,
                    })}
                </InlineAlert>

                <LatestCards latest={latest} baseCurrency={baseCurrency} />

                <div className="grid gap-4 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                        {canManage ? (
                            <AddRateForm
                                currencies={currencies}
                                baseCurrency={baseCurrency}
                            />
                        ) : (
                            <InlineAlert tone="info">
                                {t('integrations.exchange_rates.cannot_manage')}
                            </InlineAlert>
                        )}
                    </div>
                    <ProviderCard provider={provider} canManage={canManage} />
                </div>

                <RateHistory
                    rates={rates}
                    currencies={currencies}
                    filters={filters}
                />
            </div>
        </>
    );
}

ExchangeRatesIndex.layout = (
    props: ExchangeRatesIndexProps & { auth?: Auth },
) => ({
    breadcrumbs: [
        // Accountants reach this page with exchange_rates.view only: no crumb to a page they cannot open.
        ...(props.auth && can('integrations.view', props.auth)
            ? [
                  {
                      title: t('integrations.title'),
                      href: integrationsIndex.url(),
                  },
              ]
            : []),
        {
            title: t('integrations.exchange_rates.title'),
            href: exchangeRatesIndex.url(),
        },
    ],
});
