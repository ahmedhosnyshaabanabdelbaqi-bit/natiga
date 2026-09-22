import { Head, useForm } from '@inertiajs/react';
import {
    ArrowRightLeft,
    MessageSquarePlus,
    NotebookPen,
    Pencil,
    Save,
    Siren,
    UserCog,
} from 'lucide-react';
import { useState } from 'react';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { DescriptionList, SectionCard } from '@/components/shared/section-card';
import type { TimelineItem } from '@/components/shared/timeline';
import { Timeline } from '@/components/shared/timeline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import {
    IncidentStatusBadge,
    SeverityBadge,
} from '@/features/operations/badges';
import type { IncidentFormData } from '@/features/operations/incident-fields';
import { IncidentFields } from '@/features/operations/incident-fields';
import type {
    IncidentDetail,
    IncidentEventRow,
    IncidentReview,
    IncidentStatus,
    ModuleOption,
    PersonRef,
    Severity,
} from '@/features/operations/types';
import { pick, toCairoInput } from '@/features/system/i18n';
import { PageErrors } from '@/features/system/page-errors';
import { t } from '@/lib/i18n';
import {
    index as incidentsIndex,
    notes,
    review,
    show,
    status as transitionRoute,
    update,
} from '@/routes/admin/incidents';

type Props = {
    incident: IncidentDetail;
    events: IncidentEventRow[];
    transitions: IncidentStatus[];
    can: { manage: boolean };
    owners: PersonRef[];
    modules: ModuleOption[];
    severities: Severity[];
};

type ReviewForm = {
    root_cause: string;
    resolution: string;
    corrective_actions: string;
    review: Required<IncidentReview>;
};

const REVIEW_FIELDS = [
    'what_went_well',
    'what_went_wrong',
    'action_items',
    'timeline_summary',
] as const;

function statusLabel(status: unknown): string {
    return typeof status === 'string'
        ? t(`operations.incident_status.${status}`)
        : '—';
}

function timelineItems(events: IncidentEventRow[]): TimelineItem[] {
    return [...events].reverse().map((event) => {
        switch (event.type) {
            case 'created':
                return {
                    id: event.id,
                    title: t('operations.incidents.timeline.created'),
                    description: event.message,
                    at: event.created_at,
                    actor: event.author,
                    tone: 'danger',
                    icon: Siren,
                };
            case 'status_changed':
                return {
                    id: event.id,
                    title: t('operations.incidents.timeline.status_changed', {
                        from: statusLabel(event.meta?.from),
                        to: statusLabel(event.meta?.to),
                    }),
                    description: event.message,
                    at: event.created_at,
                    actor: event.author,
                    tone:
                        event.meta?.to === 'resolved' ||
                        event.meta?.to === 'closed'
                            ? 'success'
                            : 'warning',
                    icon: ArrowRightLeft,
                };
            case 'note':
                return {
                    id: event.id,
                    title: t('operations.incidents.timeline.note'),
                    description: (
                        <span className="whitespace-pre-line">
                            {event.message}
                        </span>
                    ),
                    at: event.created_at,
                    actor: event.author,
                    tone: 'info',
                    icon: MessageSquarePlus,
                };
            case 'review_updated':
                return {
                    id: event.id,
                    title: t('operations.incidents.timeline.review_updated'),
                    at: event.created_at,
                    actor: event.author,
                    tone: 'brand',
                    icon: NotebookPen,
                };
            case 'owner_changed':
                return {
                    id: event.id,
                    title: t('operations.incidents.timeline.owner_changed'),
                    at: event.created_at,
                    actor: event.author,
                    tone: 'muted',
                    icon: UserCog,
                };
            default:
                return {
                    id: event.id,
                    title: t('operations.incidents.timeline.updated'),
                    description: event.message,
                    at: event.created_at,
                    actor: event.author,
                    tone: 'muted',
                    icon: Pencil,
                };
        }
    });
}

function TransitionDialog({
    incident,
    to,
    onClose,
}: {
    incident: IncidentDetail;
    to: IncidentStatus;
    onClose: () => void;
}) {
    const form = useForm({ status: to, note: '' });
    return (
        <Dialog
            open
            onOpenChange={(open) =>
                !open && !form.processing ? onClose() : undefined
            }
        >
            <DialogContent>
                <form
                    className="grid gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.submit(transitionRoute(incident.id), {
                            preserveScroll: true,
                            onSuccess: onClose,
                        });
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>
                            {t('operations.incidents.transition.title', {
                                status: statusLabel(to),
                            })}
                        </DialogTitle>
                        <DialogDescription>
                            <Code>{incident.number}</Code> {incident.title}
                        </DialogDescription>
                    </DialogHeader>
                    {to === 'closed' ? (
                        <InlineAlert tone="info">
                            {t('operations.incidents.transition.closing_hint')}
                        </InlineAlert>
                    ) : null}
                    <FormField
                        label={t('operations.incidents.transition.note')}
                        optional
                        error={form.errors.note ?? form.errors.status}
                    >
                        <Textarea
                            value={form.data.note}
                            onChange={(event) =>
                                form.setData('note', event.target.value)
                            }
                            rows={3}
                            maxLength={2000}
                        />
                    </FormField>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onClose}
                            disabled={form.processing}
                        >
                            {t('core.actions.cancel')}
                        </Button>
                        <Button type="submit" disabled={form.processing}>
                            {form.processing ? <Spinner /> : null}
                            {t('operations.incidents.transition.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function EditDialog({
    incident,
    owners,
    modules,
    severities,
    onClose,
}: {
    incident: IncidentDetail;
    owners: PersonRef[];
    modules: ModuleOption[];
    severities: Severity[];
    onClose: () => void;
}) {
    const form = useForm<IncidentFormData>({
        title: incident.title,
        severity: incident.severity,
        affected_module: incident.affected_module ?? '',
        impact: incident.impact ?? '',
        started_at: toCairoInput(incident.started_at),
        detected_at: toCairoInput(incident.detected_at),
        owner: incident.owner?.id ?? '',
    });
    return (
        <Dialog
            open
            onOpenChange={(open) =>
                !open && !form.processing ? onClose() : undefined
            }
        >
            <DialogContent className="sm:max-w-2xl">
                <form
                    className="grid gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.submit(update(incident.id), {
                            preserveScroll: true,
                            onSuccess: onClose,
                        });
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>
                            {t('operations.incidents.actions.edit')}
                        </DialogTitle>
                        <DialogDescription>
                            <Code>{incident.number}</Code>
                        </DialogDescription>
                    </DialogHeader>
                    <IncidentFields
                        data={form.data}
                        errors={form.errors}
                        onChange={(key, value) =>
                            form.setData((data) => {
                                const next = { ...data };
                                next[key] = value;
                                return next;
                            })
                        }
                        owners={owners}
                        modules={modules}
                        severities={severities}
                    />
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onClose}
                            disabled={form.processing}
                        >
                            {t('core.actions.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            disabled={form.processing || !form.isDirty}
                        >
                            {form.processing ? (
                                <Spinner />
                            ) : (
                                <Save className="size-4" aria-hidden="true" />
                            )}
                            {t('operations.incidents.actions.save')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function ReviewSection({
    incident,
    canManage,
}: {
    incident: IncidentDetail;
    canManage: boolean;
}) {
    const form = useForm<ReviewForm>({
        root_cause: incident.root_cause ?? '',
        resolution: incident.resolution ?? '',
        corrective_actions: incident.corrective_actions ?? '',
        review: {
            what_went_well: incident.review.what_went_well ?? '',
            what_went_wrong: incident.review.what_went_wrong ?? '',
            action_items: incident.review.action_items ?? '',
            timeline_summary: incident.review.timeline_summary ?? '',
        },
    });
    const errors = form.errors as Record<string, string | undefined>;
    const setReview = (key: (typeof REVIEW_FIELDS)[number], value: string) =>
        form.setData('review', { ...form.data.review, [key]: value });

    const field = (
        key: 'root_cause' | 'resolution' | 'corrective_actions',
        required: boolean,
    ) => (
        <FormField
            key={key}
            label={t(`operations.incidents.fields.${key}`)}
            hint={
                required ? t('operations.incidents.review.required') : undefined
            }
            error={errors[key]}
        >
            <Textarea
                value={form.data[key]}
                onChange={(event) => form.setData(key, event.target.value)}
                rows={3}
                maxLength={4000}
                disabled={!canManage}
            />
        </FormField>
    );

    return (
        <SectionCard
            title={t('operations.incidents.review.title')}
            description={t('operations.incidents.review.description')}
        >
            <form
                className="grid gap-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.submit(review(incident.id), {
                        preserveScroll: true,
                        onSuccess: () => form.setDefaults(),
                    });
                }}
            >
                {field('root_cause', true)}
                {field('resolution', true)}
                {field('corrective_actions', false)}
                <div className="grid gap-4 sm:grid-cols-2">
                    {REVIEW_FIELDS.map((key) => (
                        <FormField
                            key={key}
                            label={t(`operations.incidents.fields.${key}`)}
                            error={errors[`review.${key}`]}
                        >
                            <Textarea
                                value={form.data.review[key]}
                                onChange={(event) =>
                                    setReview(key, event.target.value)
                                }
                                rows={3}
                                maxLength={4000}
                                disabled={!canManage}
                            />
                        </FormField>
                    ))}
                </div>
                {canManage ? (
                    <div className="flex justify-end">
                        <Button
                            type="submit"
                            disabled={form.processing || !form.isDirty}
                        >
                            {form.processing ? (
                                <Spinner />
                            ) : (
                                <Save className="size-4" aria-hidden="true" />
                            )}
                            {t('operations.incidents.actions.save_review')}
                        </Button>
                    </div>
                ) : null}
            </form>
        </SectionCard>
    );
}

function NoteForm({ incident }: { incident: IncidentDetail }) {
    const form = useForm({ message: '' });
    return (
        <form
            className="grid gap-2"
            onSubmit={(event) => {
                event.preventDefault();
                form.submit(notes(incident.id), {
                    preserveScroll: true,
                    onSuccess: () => form.reset(),
                });
            }}
        >
            <FormField
                label={t('operations.incidents.fields.note')}
                hideLabel
                error={form.errors.message}
            >
                <Textarea
                    value={form.data.message}
                    onChange={(event) =>
                        form.setData('message', event.target.value)
                    }
                    rows={3}
                    maxLength={2000}
                    placeholder={t(
                        'operations.incidents.timeline.note_placeholder',
                    )}
                />
            </FormField>
            <div className="flex justify-end">
                <Button
                    type="submit"
                    size="sm"
                    disabled={
                        form.processing || form.data.message.trim().length < 2
                    }
                >
                    {form.processing ? (
                        <Spinner />
                    ) : (
                        <MessageSquarePlus
                            className="size-4"
                            aria-hidden="true"
                        />
                    )}
                    {t('operations.incidents.actions.add_note')}
                </Button>
            </div>
        </form>
    );
}

export default function IncidentsShow({
    incident,
    events,
    transitions,
    can,
    owners,
    modules,
    severities,
}: Props) {
    const [transition, setTransition] = useState<IncidentStatus | null>(null);
    const [editing, setEditing] = useState(false);
    const moduleName = incident.affected_module
        ? modules.find((module) => module.key === incident.affected_module)
        : null;
    const items = timelineItems(events);
    const reviewVersion = JSON.stringify([
        incident.root_cause,
        incident.resolution,
        incident.corrective_actions,
        incident.review,
    ]);

    return (
        <>
            <Head title={`${incident.number} · ${incident.title}`} />
            <div className="grid gap-6">
                <PageHeader
                    title={incident.title}
                    actions={
                        can.manage ? (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditing(true)}
                                >
                                    <Pencil
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {t('operations.incidents.actions.edit')}
                                </Button>
                                {transitions.map((to) => (
                                    <Button
                                        key={to}
                                        size="sm"
                                        variant={
                                            to === 'open' ||
                                            to === 'investigating'
                                                ? 'outline'
                                                : 'default'
                                        }
                                        onClick={() => setTransition(to)}
                                    >
                                        {t(
                                            `operations.incidents.transitions.${to}`,
                                        )}
                                    </Button>
                                ))}
                            </>
                        ) : null
                    }
                >
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Code>{incident.number}</Code>
                        <SeverityBadge severity={incident.severity} />
                        <IncidentStatusBadge status={incident.status} />
                        <Badge variant="outline" className="font-normal">
                            {t('operations.incidents.fields.owner')}:{' '}
                            {incident.owner?.name ??
                                t('operations.incidents.labels.no_owner')}
                        </Badge>
                    </div>
                </PageHeader>

                <PageErrors
                    ignore={[
                        'message',
                        'root_cause',
                        'resolution',
                        'corrective_actions',
                    ]}
                />
                {!can.manage ? (
                    <InlineAlert tone="info">
                        {t('operations.incidents.read_only')}
                    </InlineAlert>
                ) : null}

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
                    <div className="grid content-start gap-6">
                        <SectionCard>
                            <DescriptionList
                                items={[
                                    {
                                        label: t(
                                            'operations.incidents.fields.impact',
                                        ),
                                        value: incident.impact ? (
                                            <span className="whitespace-pre-line">
                                                {incident.impact}
                                            </span>
                                        ) : null,
                                        full: true,
                                    },
                                    {
                                        label: t(
                                            'operations.incidents.fields.affected_module',
                                        ),
                                        value: moduleName
                                            ? pick(moduleName.name)
                                            : t(
                                                  'operations.incidents.labels.no_module',
                                              ),
                                    },
                                    {
                                        label: t(
                                            'operations.incidents.fields.created_by',
                                        ),
                                        value: incident.created_by,
                                    },
                                    {
                                        label: t(
                                            'operations.incidents.fields.started_at',
                                        ),
                                        value: incident.started_at,
                                        type: 'datetime',
                                    },
                                    {
                                        label: t(
                                            'operations.incidents.fields.detected_at',
                                        ),
                                        value: incident.detected_at,
                                        type: 'datetime',
                                    },
                                    {
                                        label: t(
                                            'operations.incidents.fields.resolved_at',
                                        ),
                                        value: incident.resolved_at,
                                        type: 'datetime',
                                    },
                                ]}
                            />
                        </SectionCard>
                        <ReviewSection
                            key={reviewVersion}
                            incident={incident}
                            canManage={can.manage}
                        />
                    </div>
                    <SectionCard
                        title={t('operations.incidents.timeline.title')}
                        className="content-start self-start"
                    >
                        <div className="grid gap-6">
                            {can.manage ? (
                                <NoteForm incident={incident} />
                            ) : null}
                            {items.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    {t('operations.incidents.timeline.empty')}
                                </p>
                            ) : (
                                <Timeline items={items} dense />
                            )}
                        </div>
                    </SectionCard>
                </div>
            </div>
            {transition ? (
                <TransitionDialog
                    incident={incident}
                    to={transition}
                    onClose={() => setTransition(null)}
                />
            ) : null}
            {editing ? (
                <EditDialog
                    incident={incident}
                    owners={owners}
                    modules={modules}
                    severities={severities}
                    onClose={() => setEditing(false)}
                />
            ) : null}
        </>
    );
}

IncidentsShow.layout = (props: Props) => ({
    breadcrumbs: [
        { title: t('operations.incidents.title'), href: incidentsIndex().url },
        { title: props.incident.number, href: show(props.incident.id).url },
    ],
});
