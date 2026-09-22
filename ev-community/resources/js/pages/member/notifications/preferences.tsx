import { Head, Link, useForm } from '@inertiajs/react';
import { ArrowLeft, Lock, MessageSquareText } from 'lucide-react';
import { useMemo } from 'react';
import { FormActions } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type {
    ChannelValue,
    PreferenceCategory,
    PreferenceChannel,
    PreferencesMatrix,
} from '@/features/notifications/types';
import { t } from '@/lib/i18n';
import { edit, update } from '@/routes/member/notification-preferences';
import { index as notificationsIndex } from '@/routes/member/notifications';

type FormData = {
    preferences: Record<string, Record<string, boolean>>;
    consents: { sms: boolean; whatsapp: boolean };
};

function initialData(matrix: PreferencesMatrix): FormData {
    const preferences: Record<string, Record<string, boolean>> = {};
    for (const row of matrix.categories) {
        preferences[row.category] = {};
        for (const channel of matrix.channels) {
            const cell = row.channels[channel.value];
            if (cell && !cell.locked) {
                preferences[row.category][channel.value] = cell.enabled;
            }
        }
    }
    const consent = (value: ChannelValue) =>
        matrix.channels.find((c) => c.value === value)?.consent ?? false;
    return {
        preferences,
        consents: { sms: consent('sms'), whatsapp: consent('whatsapp') },
    };
}

export default function NotificationPreferences({
    matrix,
}: {
    matrix: PreferencesMatrix;
}) {
    const form = useForm<FormData>(initialData(matrix));
    const transactional = matrix.categories.filter((row) => row.transactional);
    const marketing = matrix.categories.filter((row) => !row.transactional);
    const messaging = matrix.channels.filter((c) => c.messaging);
    const anyMessagingConfigured = messaging.some((c) => c.configured);
    const errorMessages = useMemo(
        () =>
            Object.values(form.errors).filter(
                (e): e is string => typeof e === 'string',
            ),
        [form.errors],
    );

    const consentFor = (channel: PreferenceChannel): boolean =>
        channel.value === 'sms'
            ? form.data.consents.sms
            : channel.value === 'whatsapp'
              ? form.data.consents.whatsapp
              : true;

    const setCell = (
        category: string,
        channel: ChannelValue,
        value: boolean,
    ) => {
        form.setData('preferences', {
            ...form.data.preferences,
            [category]: {
                ...form.data.preferences[category],
                [channel]: value,
            },
        });
    };

    const submit = () => {
        form.put(update.url(), {
            preserveScroll: true,
            onSuccess: () => form.setDefaults(),
        });
    };

    const renderCell = (
        row: PreferenceCategory,
        channel: PreferenceChannel,
    ) => {
        const cell = row.channels[channel.value];
        const id = `pref-${row.category}-${channel.value}`;
        if (!cell) {
            return null;
        }
        if (cell.locked) {
            return (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch
                        id={id}
                        checked
                        disabled
                        aria-label={`${row.label} — ${channel.label}: ${t('notifications.preferences.locked')}`}
                    />
                    <Lock className="size-3.5" aria-hidden="true" />
                    <span className="hidden md:inline">
                        {t('notifications.preferences.locked')}
                    </span>
                </span>
            );
        }
        const needsConsent = channel.messaging && !consentFor(channel);
        const disabled = !channel.configured || needsConsent || form.processing;
        const hint = !channel.configured
            ? t('notifications.preferences.not_configured')
            : needsConsent
              ? t('notifications.preferences.needs_consent')
              : null;
        return (
            <span className="inline-flex flex-col items-center gap-1">
                <Switch
                    id={id}
                    checked={
                        form.data.preferences[row.category]?.[channel.value] ??
                        cell.enabled
                    }
                    onCheckedChange={(value) =>
                        setCell(row.category, channel.value, value)
                    }
                    disabled={disabled}
                    aria-label={`${row.label} — ${channel.label}`}
                    aria-describedby={hint ? `${id}-hint` : undefined}
                />
                {hint ? (
                    <span
                        id={`${id}-hint`}
                        className="text-[11px] leading-tight text-muted-foreground"
                    >
                        {hint}
                    </span>
                ) : null}
            </span>
        );
    };

    const renderTable = (rows: PreferenceCategory[]) => (
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="min-w-40">
                            {t('notifications.preferences.category')}
                        </TableHead>
                        {matrix.channels.map((channel) => (
                            <TableHead
                                key={channel.value}
                                className="text-center"
                            >
                                <span className="inline-flex flex-col items-center gap-1">
                                    {channel.label}
                                    {!channel.configured ? (
                                        <Badge
                                            variant="outline"
                                            className="text-[10px] font-normal text-muted-foreground"
                                            title={t(
                                                'notifications.preferences.not_configured_hint',
                                            )}
                                        >
                                            {t(
                                                'notifications.preferences.not_configured',
                                            )}
                                        </Badge>
                                    ) : null}
                                </span>
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row) => (
                        <TableRow key={row.category}>
                            <TableCell className="font-medium">
                                {row.label}
                            </TableCell>
                            {matrix.channels.map((channel) => (
                                <TableCell
                                    key={channel.value}
                                    className="text-center align-top"
                                >
                                    {renderCell(row, channel)}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );

    return (
        <>
            <Head title={t('notifications.preferences.title')} />
            <form
                className="space-y-6"
                onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                }}
            >
                <PageHeader
                    title={t('notifications.preferences.title')}
                    description={t('notifications.preferences.description')}
                    actions={
                        <Button variant="ghost" asChild>
                            <Link href={notificationsIndex.url()} prefetch>
                                <ArrowLeft
                                    className="rtl:rotate-180"
                                    aria-hidden="true"
                                />
                                {t('notifications.preferences.back_to_center')}
                            </Link>
                        </Button>
                    }
                />

                {errorMessages.length > 0 ? (
                    <InlineAlert tone="danger">
                        <ul className="list-inside list-disc">
                            {errorMessages.map((message) => (
                                <li key={message}>{message}</li>
                            ))}
                        </ul>
                    </InlineAlert>
                ) : null}

                <SectionCard
                    title={t('notifications.preferences.consent_title')}
                    description={t('notifications.preferences.consent_hint')}
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        {messaging.map((channel) => {
                            const id = `consent-${channel.value}`;
                            const checked =
                                channel.value === 'sms'
                                    ? form.data.consents.sms
                                    : form.data.consents.whatsapp;
                            return (
                                <div
                                    key={channel.value}
                                    className="flex items-start gap-3 rounded-lg border p-3"
                                >
                                    <Switch
                                        id={id}
                                        checked={checked}
                                        disabled={
                                            !channel.configured ||
                                            form.processing
                                        }
                                        onCheckedChange={(value) =>
                                            form.setData('consents', {
                                                ...form.data.consents,
                                                [channel.value]: value,
                                            })
                                        }
                                    />
                                    <div className="space-y-1">
                                        <Label
                                            htmlFor={id}
                                            className="flex items-center gap-2"
                                        >
                                            <MessageSquareText
                                                className="size-4 text-muted-foreground"
                                                aria-hidden="true"
                                            />
                                            {channel.value === 'sms'
                                                ? t(
                                                      'notifications.preferences.consent_sms',
                                                  )
                                                : t(
                                                      'notifications.preferences.consent_whatsapp',
                                                  )}
                                        </Label>
                                        {!channel.configured ? (
                                            <p className="text-xs text-muted-foreground">
                                                {t(
                                                    'notifications.preferences.not_configured_hint',
                                                )}
                                            </p>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {!anyMessagingConfigured ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                            {t('notifications.preferences.sms_hint')}
                        </p>
                    ) : null}
                </SectionCard>

                <SectionCard
                    title={t('notifications.preferences.transactional_title')}
                    description={t(
                        'notifications.preferences.transactional_hint',
                    )}
                    flush
                >
                    {renderTable(transactional)}
                </SectionCard>

                <SectionCard
                    title={t('notifications.preferences.marketing_title')}
                    description={t('notifications.preferences.marketing_hint')}
                    flush
                >
                    {renderTable(marketing)}
                </SectionCard>

                <FormActions align="between">
                    <span
                        className="text-sm text-muted-foreground"
                        aria-live="polite"
                    >
                        {form.isDirty
                            ? t('notifications.preferences.unsaved')
                            : null}
                    </span>
                    <Button
                        type="submit"
                        disabled={form.processing || !form.isDirty}
                    >
                        {form.processing ? <Spinner /> : null}
                        {t('notifications.preferences.save')}
                    </Button>
                </FormActions>
            </form>
        </>
    );
}

NotificationPreferences.layout = () => ({
    breadcrumbs: [
        {
            title: t('notifications.center.title'),
            href: notificationsIndex.url(),
        },
        { title: t('notifications.preferences.title'), href: edit.url() },
    ],
});
