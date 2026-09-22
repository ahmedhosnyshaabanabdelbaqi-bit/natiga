import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    CalendarClock,
    Pencil,
    RotateCcw,
    Send,
    Trash2,
    XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { DescriptionList, SectionCard } from '@/components/shared/section-card';
import { StatCard } from '@/components/shared/stat-card';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import { DateInput } from '@/components/ui/date-input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { AdminNotificationsNav } from '@/features/notifications/admin-nav';
import { CampaignStatusBadge } from '@/features/notifications/campaign-status-badge';
import type { Campaign } from '@/features/notifications/types';
import { formatDateTime, formatNumber } from '@/lib/format';
import { currentLocale, t } from '@/lib/i18n';
import {
    cancel,
    destroy,
    edit,
    index,
    schedule,
    send,
    show,
} from '@/routes/admin/notifications';

type Stats = {
    by_status: Record<'pending' | 'sent' | 'skipped' | 'failed', number>;
    failures: {
        member_number: string | null;
        name: string;
        error: string | null;
    }[];
};

type Props = {
    campaign: Campaign;
    stats: Stats;
    audienceCount: number | null;
    canManage: boolean;
};

type DialogKind = 'send' | 'retry' | 'cancel' | 'delete' | 'schedule' | null;

const POLL_MS = 5000;

function defaultScheduleValue(): string {
    const date = new Date(Date.now() + 60 * 60 * 1000);
    date.setMinutes(0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AnnouncementShow({
    campaign,
    stats,
    audienceCount,
    canManage,
}: Props) {
    const { errors } = usePage().props as { errors?: Record<string, string> };
    const [dialog, setDialog] = useState<DialogKind>(null);
    const [processing, setProcessing] = useState(false);
    const [scheduledAt, setScheduledAt] = useState(defaultScheduleValue);
    const sending = campaign.status === 'sending';

    // Live progress while the background job runs.
    useEffect(() => {
        if (!sending) {
            return;
        }
        const timer = window.setInterval(
            () => router.reload({ only: ['campaign', 'stats'] }),
            POLL_MS,
        );
        return () => window.clearInterval(timer);
    }, [sending]);

    const errorMessages = Object.values(errors ?? {}).filter(
        (message) => typeof message === 'string' && message !== '',
    );

    const visit = (
        method: 'post' | 'delete',
        url: string,
        data: Record<string, string> = {},
    ) =>
        new Promise<void>((resolve) => {
            setProcessing(true);
            router.visit(url, {
                method,
                data,
                preserveScroll: true,
                onSuccess: () => setDialog(null),
                onError: () => setDialog(null),
                onFinish: () => {
                    setProcessing(false);
                    resolve();
                },
            });
        });

    const skipped = campaign.skipped_count;
    const locale = currentLocale();

    return (
        <>
            <Head title={campaign.title} />
            <div className="space-y-6">
                <PageHeader
                    title={campaign.title}
                    description={campaign.audience_summary}
                    actions={
                        canManage ? (
                            <>
                                {campaign.can.edit ? (
                                    <Button variant="outline" asChild>
                                        <Link href={edit.url(campaign.id)}>
                                            <Pencil aria-hidden="true" />
                                            {t(
                                                'notifications.admin.actions.edit',
                                            )}
                                        </Link>
                                    </Button>
                                ) : null}
                                {campaign.can.schedule ? (
                                    <Button
                                        variant="outline"
                                        onClick={() => setDialog('schedule')}
                                    >
                                        <CalendarClock aria-hidden="true" />
                                        {t(
                                            'notifications.admin.actions.schedule',
                                        )}
                                    </Button>
                                ) : null}
                                {campaign.can.send ? (
                                    <Button onClick={() => setDialog('send')}>
                                        <Send
                                            className="rtl:-scale-x-100"
                                            aria-hidden="true"
                                        />
                                        {t(
                                            'notifications.admin.actions.send_now',
                                        )}
                                    </Button>
                                ) : null}
                                {campaign.can.retry ? (
                                    <Button onClick={() => setDialog('retry')}>
                                        <RotateCcw aria-hidden="true" />
                                        {t(
                                            'notifications.admin.actions.resend',
                                        )}
                                    </Button>
                                ) : null}
                                {campaign.can.cancel ? (
                                    <Button
                                        variant="ghost"
                                        onClick={() => setDialog('cancel')}
                                    >
                                        <XCircle aria-hidden="true" />
                                        {t(
                                            'notifications.admin.actions.cancel_campaign',
                                        )}
                                    </Button>
                                ) : null}
                                {campaign.can.delete ? (
                                    <Button
                                        variant="ghost"
                                        className="text-danger"
                                        onClick={() => setDialog('delete')}
                                    >
                                        <Trash2 aria-hidden="true" />
                                        {t(
                                            'notifications.admin.actions.delete_draft',
                                        )}
                                    </Button>
                                ) : null}
                            </>
                        ) : null
                    }
                >
                    <div className="mt-2">
                        <CampaignStatusBadge
                            status={campaign.status}
                            label={campaign.status_label}
                        />
                    </div>
                </PageHeader>

                <AdminNotificationsNav current="campaigns" />

                {errorMessages.length > 0 ? (
                    <InlineAlert tone="danger">
                        {errorMessages.map((message) => (
                            <p key={message}>{message}</p>
                        ))}
                    </InlineAlert>
                ) : null}
                {campaign.status === 'scheduled' && campaign.scheduled_at ? (
                    <InlineAlert tone="info" icon={CalendarClock}>
                        {t('notifications.admin.scheduled_for', {
                            date: formatDateTime(campaign.scheduled_at),
                        })}
                    </InlineAlert>
                ) : null}
                {sending ? (
                    <InlineAlert tone="warning" icon={null}>
                        <span className="inline-flex items-center gap-2">
                            <Spinner />
                            {t('notifications.admin.sending_hint')}
                            {stats.by_status.pending > 0
                                ? ` — ${t('notifications.recipient_status.pending')}: ${formatNumber(stats.by_status.pending, 0)}`
                                : null}
                        </span>
                    </InlineAlert>
                ) : null}
                {campaign.status === 'failed' ? (
                    <InlineAlert
                        tone="danger"
                        title={t('notifications.admin.failed_hint')}
                    >
                        {campaign.last_error ? (
                            <p>
                                {t('notifications.admin.fields.last_error')}:{' '}
                                <Code>{campaign.last_error}</Code>
                            </p>
                        ) : null}
                    </InlineAlert>
                ) : null}

                <section
                    aria-label={t('notifications.admin.progress')}
                    className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                >
                    <StatCard
                        label={t('notifications.admin.fields.recipients')}
                        value={formatNumber(campaign.recipients_count, 0)}
                        tone="brand"
                    />
                    <StatCard
                        label={t('notifications.admin.fields.sent')}
                        value={formatNumber(campaign.sent_count, 0)}
                        tone="success"
                    />
                    <StatCard
                        label={t('notifications.admin.fields.skipped')}
                        value={formatNumber(skipped, 0)}
                    />
                    <StatCard
                        label={t('notifications.admin.fields.failed')}
                        value={formatNumber(campaign.failed_count, 0)}
                        tone={campaign.failed_count > 0 ? 'danger' : 'default'}
                    />
                </section>

                <div className="grid gap-6 lg:grid-cols-3">
                    <SectionCard
                        title={t('notifications.admin.fields.delivery')}
                        className="lg:col-span-1"
                    >
                        <DescriptionList
                            columns={1}
                            items={[
                                {
                                    label: t(
                                        'notifications.admin.fields.status',
                                    ),
                                    value: (
                                        <CampaignStatusBadge
                                            status={campaign.status}
                                            label={campaign.status_label}
                                        />
                                    ),
                                },
                                {
                                    label: t('notifications.admin.fields.type'),
                                    value: campaign.is_marketing
                                        ? t(
                                              'notifications.admin.fields.marketing',
                                          )
                                        : t(
                                              'notifications.admin.fields.service',
                                          ),
                                },
                                {
                                    label: t(
                                        'notifications.admin.fields.category',
                                    ),
                                    value: campaign.category_label,
                                },
                                {
                                    label: t(
                                        'notifications.admin.audience_summary',
                                    ),
                                    value: campaign.audience_summary,
                                },
                                {
                                    label: t(
                                        'notifications.admin.fields.channels',
                                    ),
                                    value: campaign.channel_labels.join(
                                        locale === 'ar' ? '، ' : ', ',
                                    ),
                                },
                                {
                                    label: t('notifications.admin.fields.url'),
                                    value: campaign.url,
                                    type: 'code',
                                },
                                {
                                    label: t(
                                        'notifications.admin.fields.scheduled_at',
                                    ),
                                    value: campaign.scheduled_at,
                                    type: 'datetime',
                                    hidden: !campaign.scheduled_at,
                                },
                                {
                                    label: t(
                                        'notifications.admin.fields.started_at',
                                    ),
                                    value: campaign.started_at,
                                    type: 'datetime',
                                    hidden: !campaign.started_at,
                                },
                                {
                                    label: t(
                                        'notifications.admin.fields.finished_at',
                                    ),
                                    value: campaign.finished_at,
                                    type: 'datetime',
                                    hidden: !campaign.finished_at,
                                },
                                {
                                    label: t(
                                        'notifications.admin.fields.created_by',
                                    ),
                                    value: campaign.created_by,
                                },
                                {
                                    label: t(
                                        'notifications.admin.fields.created_at',
                                    ),
                                    value: campaign.created_at,
                                    type: 'datetime',
                                },
                            ]}
                        />
                    </SectionCard>

                    <SectionCard
                        title={t('notifications.admin.fields.content')}
                        className="lg:col-span-2"
                    >
                        <div className="grid gap-4 md:grid-cols-2">
                            <div
                                dir="rtl"
                                lang="ar"
                                className="space-y-1 rounded-lg border p-4"
                            >
                                <p className="text-xs text-muted-foreground">
                                    {t('core.labels.arabic')}
                                </p>
                                <p className="font-semibold">
                                    {campaign.title_ar}
                                </p>
                                <p className="text-sm whitespace-pre-line text-muted-foreground">
                                    {campaign.body_ar}
                                </p>
                            </div>
                            <div
                                dir="ltr"
                                lang="en"
                                className="space-y-1 rounded-lg border p-4"
                            >
                                <p className="text-xs text-muted-foreground">
                                    {t('core.labels.english')}
                                </p>
                                <p className="font-semibold">
                                    {campaign.title_en}
                                </p>
                                <p className="text-sm whitespace-pre-line text-muted-foreground">
                                    {campaign.body_en}
                                </p>
                            </div>
                        </div>
                    </SectionCard>
                </div>

                <SectionCard
                    title={t('notifications.admin.recent_failures')}
                    flush
                >
                    {stats.failures.length === 0 ? (
                        <p className="px-4 py-4 text-sm text-muted-foreground md:px-6">
                            {t('notifications.admin.no_failures')}
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {stats.failures.map((failure, i) => (
                                <li
                                    key={`${failure.member_number ?? 'x'}-${i}`}
                                    className="flex flex-col gap-1 px-4 py-3 md:px-6"
                                >
                                    <span className="flex items-center gap-2 text-sm font-medium">
                                        {failure.member_number ? (
                                            <Code>{failure.member_number}</Code>
                                        ) : null}
                                        {failure.name}
                                    </span>
                                    {failure.error ? (
                                        <span className="text-xs break-words text-danger">
                                            {failure.error}
                                        </span>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    )}
                </SectionCard>
            </div>

            <ConfirmDialog
                open={dialog === 'send'}
                onOpenChange={(open) => setDialog(open ? 'send' : null)}
                title={t('notifications.admin.confirm.send_title')}
                description={t('notifications.admin.confirm.send_text', {
                    count:
                        audienceCount === null
                            ? '—'
                            : formatNumber(audienceCount, 0),
                })}
                confirmLabel={t('notifications.admin.actions.send_now')}
                processing={processing}
                onConfirm={() => visit('post', send.url(campaign.id))}
            />
            <ConfirmDialog
                open={dialog === 'retry'}
                onOpenChange={(open) => setDialog(open ? 'retry' : null)}
                title={t('notifications.admin.confirm.retry_title')}
                description={t('notifications.admin.confirm.retry_text')}
                confirmLabel={t('notifications.admin.actions.resend')}
                processing={processing}
                onConfirm={() => visit('post', send.url(campaign.id))}
            />
            <ConfirmDialog
                open={dialog === 'cancel'}
                onOpenChange={(open) => setDialog(open ? 'cancel' : null)}
                title={t('notifications.admin.confirm.cancel_title')}
                description={t('notifications.admin.confirm.cancel_text')}
                confirmLabel={t('notifications.admin.actions.cancel_campaign')}
                destructive
                processing={processing}
                onConfirm={() => visit('post', cancel.url(campaign.id))}
            />
            <ConfirmDialog
                open={dialog === 'delete'}
                onOpenChange={(open) => setDialog(open ? 'delete' : null)}
                title={t('notifications.admin.confirm.delete_title')}
                description={t('notifications.admin.confirm.delete_text')}
                confirmLabel={t('notifications.admin.actions.delete_draft')}
                destructive
                processing={processing}
                onConfirm={() => visit('delete', destroy.url(campaign.id))}
            />

            <Dialog
                open={dialog === 'schedule'}
                onOpenChange={(open) =>
                    !processing && setDialog(open ? 'schedule' : null)
                }
            >
                <DialogContent>
                    <form
                        className="space-y-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void visit('post', schedule.url(campaign.id), {
                                scheduled_at: scheduledAt,
                            });
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>
                                {t(
                                    'notifications.admin.confirm.schedule_title',
                                )}
                            </DialogTitle>
                            <DialogDescription>
                                {t('notifications.admin.confirm.schedule_text')}
                            </DialogDescription>
                        </DialogHeader>
                        <FormField
                            label={t('notifications.admin.fields.scheduled_at')}
                            hint={t(
                                'notifications.admin.fields.scheduled_at_hint',
                            )}
                            error={errors?.scheduled_at}
                            required
                        >
                            <DateInput
                                mode="datetime"
                                value={scheduledAt}
                                onChange={(event) =>
                                    setScheduledAt(event.target.value)
                                }
                                required
                            />
                        </FormField>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setDialog(null)}
                                disabled={processing}
                            >
                                {t('core.actions.cancel')}
                            </Button>
                            <Button
                                type="submit"
                                disabled={processing || scheduledAt === ''}
                            >
                                {processing ? <Spinner /> : null}
                                {t('notifications.admin.actions.schedule')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}

AnnouncementShow.layout = (props: Props) => ({
    breadcrumbs: [
        { title: t('notifications.admin.title'), href: index.url() },
        { title: props.campaign.title, href: show.url(props.campaign.id) },
    ],
});
