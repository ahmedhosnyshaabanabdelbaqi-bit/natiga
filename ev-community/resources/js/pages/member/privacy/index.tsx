import { Head, useForm } from '@inertiajs/react';
import { Database, PowerOff, Trash2 } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { DateTime } from '@/components/shared/date-time';
import { EmptyState } from '@/components/shared/empty-state';
import { FormActions, FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { DescriptionList, SectionCard } from '@/components/shared/section-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Code } from '@/components/ui/code';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
import { Textarea } from '@/components/ui/textarea';
import { DeletionStatusBadge } from '@/features/members/status';
import type {
    ConsentEntry,
    DeletionRequestSummary,
    MarketingConsents,
} from '@/features/members/types';
import { t } from '@/lib/i18n';
import {
    consents,
    deactivate,
    deletionRequest,
    index,
} from '@/routes/member/privacy';

type Props = {
    summary: {
        name: string;
        email: string;
        mobile: string | null;
        governorate: string | null;
        member_number: string | null;
        joined_at: string | null;
    };
    marketing: MarketingConsents;
    history: ConsentEntry[];
    deletion_request: DeletionRequestSummary | null;
};

const SUMMARY_ITEMS = [
    'identity',
    'membership',
    'vehicles',
    'activity',
    'consents',
    'security',
] as const;
const CHANNELS: (keyof MarketingConsents)[] = [
    'marketing_email',
    'marketing_sms',
    'marketing_whatsapp',
];

export default function MemberPrivacy({
    summary,
    marketing,
    history,
    deletion_request: latestRequest,
}: Props) {
    const requestOpen =
        latestRequest !== null &&
        (latestRequest.status === 'requested' ||
            latestRequest.status === 'under_review');

    return (
        <>
            <Head title={t('privacy.title')} />
            <PageHeader
                title={t('privacy.title')}
                description={t('privacy.description')}
            />

            <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard
                    title={t('privacy.summary.title')}
                    description={t('privacy.summary.intro')}
                >
                    <ul className="grid gap-2 text-sm">
                        {SUMMARY_ITEMS.map((item) => (
                            <li key={item} className="flex gap-2">
                                <Database
                                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                                    aria-hidden="true"
                                />
                                <span>
                                    {t(`privacy.summary.items.${item}`)}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-4 text-xs text-muted-foreground">
                        {t('privacy.summary.retention')}
                    </p>
                </SectionCard>
                <SectionCard title={t('privacy.summary.your_data')}>
                    <DescriptionList
                        items={[
                            {
                                label: t('core.labels.name'),
                                value: summary.name,
                            },
                            {
                                label: t('core.labels.email'),
                                value: <span dir="ltr">{summary.email}</span>,
                            },
                            {
                                label: t('core.labels.mobile'),
                                value: summary.mobile ? (
                                    <span dir="ltr">{summary.mobile}</span>
                                ) : null,
                            },
                            {
                                label: t('core.labels.governorate'),
                                value: summary.governorate,
                            },
                            {
                                label: t('members.card.member_number'),
                                value: summary.member_number,
                                type: 'code',
                            },
                            {
                                label: t('members.card.member_since'),
                                value: summary.joined_at,
                                type: 'date',
                            },
                        ]}
                    />
                </SectionCard>
            </div>

            <MarketingPreferences marketing={marketing} />

            <SectionCard title={t('privacy.consents.history')} flush>
                {history.length === 0 ? (
                    <div className="p-4">
                        <EmptyState title={t('privacy.consents.empty')} />
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('core.labels.type')}</TableHead>
                                <TableHead>{t('core.labels.status')}</TableHead>
                                <TableHead>
                                    {t('privacy.consents.version')}
                                </TableHead>
                                <TableHead>{t('core.labels.date')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {history.map((entry) => (
                                <TableRow key={entry.id}>
                                    <TableCell>{entry.label}</TableCell>
                                    <TableCell>
                                        <StatusBadge
                                            status={
                                                entry.granted
                                                    ? 'granted'
                                                    : 'withdrawn'
                                            }
                                            tone={
                                                entry.granted
                                                    ? 'success'
                                                    : 'muted'
                                            }
                                            label={
                                                entry.granted
                                                    ? t(
                                                          'privacy.consents.granted',
                                                      )
                                                    : t(
                                                          'privacy.consents.withdrawn',
                                                      )
                                            }
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {entry.version ? (
                                            <Code>{entry.version}</Code>
                                        ) : (
                                            '—'
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <DateTime value={entry.created_at} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </SectionCard>

            <div className="grid gap-4 lg:grid-cols-2">
                <DeletionRequestCard
                    latest={latestRequest}
                    open={requestOpen}
                />
                <DeactivateCard />
            </div>
        </>
    );
}

function MarketingPreferences({ marketing }: { marketing: MarketingConsents }) {
    const form = useForm<MarketingConsents>({ ...marketing });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.put(consents.url(), {
            preserveScroll: true,
            onSuccess: () => form.setDefaults(),
        });
    };

    return (
        <SectionCard
            title={t('privacy.consents.title')}
            description={t('privacy.consents.description')}
        >
            <form onSubmit={submit} className="grid gap-4" noValidate>
                <ul className="grid gap-3">
                    {CHANNELS.map((channel) => (
                        <li
                            key={channel}
                            className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3"
                        >
                            <Label
                                htmlFor={`consent-${channel}`}
                                className="font-normal"
                            >
                                {t(`privacy.consents.${channel}`)}
                            </Label>
                            <Switch
                                id={`consent-${channel}`}
                                checked={form.data[channel]}
                                onCheckedChange={(checked) =>
                                    form.setData(channel, checked)
                                }
                            />
                        </li>
                    ))}
                </ul>
                <FormActions sticky={false}>
                    <Button
                        type="submit"
                        disabled={form.processing || !form.isDirty}
                    >
                        {form.processing ? <Spinner /> : null}
                        {t('core.actions.save')}
                    </Button>
                </FormActions>
            </form>
        </SectionCard>
    );
}

function DeletionRequestCard({
    latest,
    open,
}: {
    latest: DeletionRequestSummary | null;
    open: boolean;
}) {
    const form = useForm({ reason: '', acknowledge: false });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.post(deletionRequest.url(), {
            preserveScroll: true,
            onSuccess: () => form.reset(),
        });
    };

    return (
        <SectionCard
            title={t('privacy.deletion.title')}
            description={t('privacy.deletion.description')}
        >
            <div className="grid gap-4">
                {latest ? (
                    <InlineAlert
                        tone={
                            open
                                ? 'warning'
                                : latest.status === 'completed'
                                  ? 'success'
                                  : 'info'
                        }
                        title={
                            open
                                ? t('privacy.deletion.pending_title')
                                : latest.status === 'completed'
                                  ? t('privacy.deletion.completed_title')
                                  : t('privacy.deletion.rejected_title')
                        }
                    >
                        <span className="flex flex-wrap items-center gap-2">
                            <DeletionStatusBadge status={latest.status} />
                            {open ? (
                                <span>
                                    {t('privacy.deletion.requested_on')}{' '}
                                    <DateTime value={latest.requested_at} />
                                </span>
                            ) : latest.processed_at ? (
                                <span>
                                    {t('privacy.deletion.processed_on')}{' '}
                                    <DateTime value={latest.processed_at} />
                                </span>
                            ) : null}
                        </span>
                    </InlineAlert>
                ) : null}
                <p className="text-xs text-muted-foreground">
                    {t('privacy.deletion.retention_note')}
                </p>
                {!open ? (
                    <form onSubmit={submit} className="grid gap-4" noValidate>
                        <FormField
                            label={t('privacy.deletion.reason')}
                            error={form.errors.reason}
                            optional
                        >
                            <Textarea
                                value={form.data.reason}
                                onChange={(event) =>
                                    form.setData('reason', event.target.value)
                                }
                                rows={3}
                                maxLength={1000}
                            />
                        </FormField>
                        <FormField
                            label={t('privacy.deletion.acknowledge_label')}
                            error={form.errors.acknowledge}
                            inline
                            required
                        >
                            <Checkbox
                                checked={form.data.acknowledge}
                                onCheckedChange={(checked) =>
                                    form.setData(
                                        'acknowledge',
                                        checked === true,
                                    )
                                }
                            />
                        </FormField>
                        <div>
                            <Button
                                type="submit"
                                variant="destructive"
                                disabled={
                                    form.processing || !form.data.acknowledge
                                }
                            >
                                {form.processing ? (
                                    <Spinner />
                                ) : (
                                    <Trash2
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                )}
                                {t('privacy.deletion.action')}
                            </Button>
                        </div>
                    </form>
                ) : null}
            </div>
        </SectionCard>
    );
}

function DeactivateCard() {
    const [open, setOpen] = useState(false);
    const form = useForm({ current_password: '', reason: '' });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.post(deactivate.url(), {
            preserveScroll: true,
            onError: () => form.reset('current_password'),
        });
    };

    return (
        <SectionCard
            title={t('privacy.deactivate.title')}
            description={t('privacy.deactivate.description')}
        >
            <Dialog
                open={open}
                onOpenChange={(next) => {
                    if (!form.processing) {
                        setOpen(next);
                        if (!next) {
                            form.reset();
                            form.clearErrors();
                        }
                    }
                }}
            >
                <DialogTrigger asChild>
                    <Button type="button" variant="destructive">
                        <PowerOff className="size-4" aria-hidden="true" />
                        {t('privacy.deactivate.action')}
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {t('privacy.deactivate.confirm_title')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('privacy.deactivate.confirm_text')}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-4" noValidate>
                        <FormField
                            label={t('privacy.deactivate.password')}
                            error={form.errors.current_password}
                            required
                        >
                            <Input
                                type="password"
                                autoComplete="current-password"
                                value={form.data.current_password}
                                onChange={(event) =>
                                    form.setData(
                                        'current_password',
                                        event.target.value,
                                    )
                                }
                                autoFocus
                            />
                        </FormField>
                        <FormField
                            label={t('privacy.deactivate.reason')}
                            error={form.errors.reason}
                            optional
                        >
                            <Textarea
                                value={form.data.reason}
                                onChange={(event) =>
                                    form.setData('reason', event.target.value)
                                }
                                rows={2}
                                maxLength={500}
                            />
                        </FormField>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setOpen(false)}
                                disabled={form.processing}
                            >
                                {t('core.actions.cancel')}
                            </Button>
                            <Button
                                type="submit"
                                variant="destructive"
                                disabled={
                                    form.processing ||
                                    form.data.current_password === ''
                                }
                            >
                                {form.processing ? <Spinner /> : null}
                                {t('privacy.deactivate.action')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </SectionCard>
    );
}

MemberPrivacy.layout = () => ({
    breadcrumbs: [{ title: t('privacy.title'), href: index.url() }],
});
