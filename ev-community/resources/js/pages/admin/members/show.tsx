import { Head, Link, router } from '@inertiajs/react';
import { KeyRound, MailCheck, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DateTime } from '@/components/shared/date-time';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { PhoneNumber } from '@/components/shared/phone-number';
import { DescriptionList, SectionCard } from '@/components/shared/section-card';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import type { TimelineItem } from '@/components/shared/timeline';
import { Timeline } from '@/components/shared/timeline';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EditProfileDialog } from '@/features/members/edit-profile-dialog';
import { MemberNotes } from '@/features/members/member-notes';
import {
    firstError,
    MemberStatusActions,
} from '@/features/members/member-status-actions';
import {
    DeletionStatusBadge,
    membershipTone,
    MembershipStatusBadge,
    ReferralStatusBadge,
    VerificationResultBadge,
} from '@/features/members/status';
import type {
    AdminReferredMember,
    ConsentEntry,
    DeletionRequestSummary,
    GovernorateOption,
    MarketingConsents,
    MemberNote,
    MembershipDetail,
    ReferralStats,
    SecurityEventEntry,
    StatusHistoryEntry,
    VerificationEntry,
} from '@/features/members/types';
import { useCan } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { index as deletionRequestsIndex } from '@/routes/admin/members/deletion-requests';
import {
    index,
    resendVerification,
    rotateToken,
    show,
} from '@/routes/admin/members';

type Props = {
    membership: MembershipDetail;
    history: StatusHistoryEntry[];
    verifications: VerificationEntry[];
    notes: MemberNote[];
    consents: ConsentEntry[];
    marketing: MarketingConsents;
    security_events: SecurityEventEntry[] | null;
    deletion_requests: DeletionRequestSummary[];
    referrals: { stats: ReferralStats; list: AdminReferredMember[] } | null;
    governorates: GovernorateOption[];
    locales: string[];
};

export default function AdminMemberShow(props: Props) {
    const { membership } = props;
    const can = useCan();
    const [confirm, setConfirm] = useState<'rotate' | 'resend' | null>(null);
    const [processing, setProcessing] = useState(false);
    const openDeletion = props.deletion_requests.some(
        (request) =>
            request.status === 'requested' || request.status === 'under_review',
    );

    const post = (url: string) => {
        setProcessing(true);
        router.post(
            url,
            {},
            {
                preserveScroll: true,
                onSuccess: () => setConfirm(null),
                onError: (errors) => toast.error(firstError(errors)),
                onFinish: () => setProcessing(false),
            },
        );
    };

    return (
        <>
            <Head
                title={`${membership.user.name} · ${membership.member_number}`}
            />
            <PageHeader
                title={membership.user.name}
                actions={
                    <>
                        <MemberStatusActions membership={membership} />
                        {membership.abilities.update ? (
                            <EditProfileDialog
                                membership={membership}
                                governorates={props.governorates}
                                locales={props.locales}
                            />
                        ) : null}
                    </>
                }
            >
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <Code>{membership.member_number}</Code>
                    <MembershipStatusBadge status={membership.status} />
                    {membership.user.status === 'disabled' ? (
                        <StatusBadge
                            status="disabled"
                            label={t('members.admin.account_disabled')}
                        />
                    ) : null}
                    <span className="text-muted-foreground">
                        {t('members.card.member_since')}{' '}
                        <DateTime value={membership.joined_at} mode="date" />
                    </span>
                </div>
            </PageHeader>

            {openDeletion ? (
                <InlineAlert
                    tone="warning"
                    title={t('members.admin.deletion.open_title')}
                    action={
                        can('members.delete_requests') ? (
                            <Button asChild size="sm" variant="outline">
                                <Link
                                    href={deletionRequestsIndex.url({
                                        query: {
                                            search: membership.member_number,
                                        },
                                    })}
                                >
                                    {t(
                                        'members.admin.actions.deletion_requests',
                                    )}
                                </Link>
                            </Button>
                        ) : null
                    }
                >
                    {t('members.admin.deletion.open_text')}
                </InlineAlert>
            ) : null}

            <Tabs defaultValue="profile" className="gap-4">
                <TabsList className="h-auto flex-wrap justify-start">
                    <TabsTrigger value="profile">
                        {t('members.admin.tabs.profile')}
                    </TabsTrigger>
                    <TabsTrigger value="membership">
                        {t('members.admin.tabs.membership')}
                    </TabsTrigger>
                    <TabsTrigger value="notes">
                        {t('members.admin.tabs.notes')}
                        {props.notes.length > 0 ? (
                            <span className="tabular ms-1 text-xs text-muted-foreground">
                                ({props.notes.length})
                            </span>
                        ) : null}
                    </TabsTrigger>
                    <TabsTrigger value="consents">
                        {t('members.admin.tabs.consents')}
                    </TabsTrigger>
                    <TabsTrigger value="security">
                        {t('members.admin.tabs.security')}
                    </TabsTrigger>
                    <TabsTrigger value="deletion">
                        {t('members.admin.tabs.deletion')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="profile" className="grid gap-4">
                    <SectionCard
                        title={t('members.admin.profile.title')}
                        actions={
                            membership.abilities.resendVerification &&
                            membership.user.email_verified_at === null &&
                            membership.user.status === 'active' ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setConfirm('resend')}
                                >
                                    <MailCheck
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {t(
                                        'members.admin.actions.resend_verification',
                                    )}
                                </Button>
                            ) : null
                        }
                    >
                        <DescriptionList
                            items={[
                                {
                                    label: t('core.labels.name'),
                                    value: membership.user.name,
                                },
                                {
                                    label: t('core.labels.email'),
                                    value: (
                                        <span dir="ltr">
                                            {membership.user.email}
                                        </span>
                                    ),
                                },
                                {
                                    label: t('core.labels.mobile'),
                                    value: membership.user.mobile ? (
                                        <PhoneNumber
                                            value={membership.user.mobile}
                                            whatsapp
                                        />
                                    ) : null,
                                },
                                {
                                    label: t('core.labels.governorate'),
                                    value: membership.user.governorate,
                                },
                                {
                                    label: t('members.admin.profile.locale'),
                                    value:
                                        membership.user.preferred_locale ===
                                        'ar'
                                            ? t('core.labels.arabic')
                                            : t('core.labels.english'),
                                },
                                {
                                    label: t(
                                        'members.admin.profile.account_status',
                                    ),
                                    value: (
                                        <StatusBadge
                                            status={membership.user.status}
                                            label={t(
                                                `members.admin.account_status.${membership.user.status}`,
                                            )}
                                        />
                                    ),
                                },
                                {
                                    label: t(
                                        'members.admin.profile.email_verified',
                                    ),
                                    value: membership.user.email_verified_at ? (
                                        <DateTime
                                            value={
                                                membership.user
                                                    .email_verified_at
                                            }
                                        />
                                    ) : (
                                        t('core.labels.no')
                                    ),
                                },
                                {
                                    label: t('members.admin.profile.mfa'),
                                    value: membership.user.mfa_enabled
                                        ? t('core.labels.yes')
                                        : t('core.labels.no'),
                                },
                                {
                                    label: t(
                                        'members.admin.profile.last_login',
                                    ),
                                    value: membership.user.last_login_at ? (
                                        <DateTime
                                            value={
                                                membership.user.last_login_at
                                            }
                                        />
                                    ) : (
                                        t('members.admin.profile.never')
                                    ),
                                },
                                {
                                    label: t(
                                        'members.admin.profile.registered_at',
                                    ),
                                    value: membership.user.created_at,
                                    type: 'datetime',
                                },
                            ]}
                        />
                    </SectionCard>
                </TabsContent>

                <TabsContent value="membership" className="grid gap-4">
                    <MembershipTab
                        {...props}
                        onRotate={() => setConfirm('rotate')}
                    />
                </TabsContent>

                <TabsContent value="notes">
                    <MemberNotes
                        membershipId={membership.id}
                        notes={props.notes}
                    />
                </TabsContent>

                <TabsContent value="consents" className="grid gap-4">
                    <SectionCard title={t('members.admin.consents.marketing')}>
                        <DescriptionList
                            columns={2}
                            items={(
                                Object.keys(
                                    props.marketing,
                                ) as (keyof MarketingConsents)[]
                            ).map((type) => ({
                                label: t(`privacy.consents.${type}`),
                                value: (
                                    <StatusBadge
                                        status={
                                            props.marketing[type]
                                                ? 'granted'
                                                : 'withdrawn'
                                        }
                                        tone={
                                            props.marketing[type]
                                                ? 'success'
                                                : 'muted'
                                        }
                                        label={
                                            props.marketing[type]
                                                ? t(
                                                      'members.admin.consents.granted',
                                                  )
                                                : t(
                                                      'members.admin.consents.not_granted',
                                                  )
                                        }
                                    />
                                ),
                            }))}
                        />
                    </SectionCard>
                    <SectionCard
                        title={t('members.admin.consents.title')}
                        flush
                    >
                        {props.consents.length === 0 ? (
                            <div className="p-4">
                                <EmptyState
                                    title={t('members.admin.consents.empty')}
                                />
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>
                                            {t('core.labels.type')}
                                        </TableHead>
                                        <TableHead>
                                            {t('core.labels.status')}
                                        </TableHead>
                                        <TableHead>
                                            {t('privacy.consents.version')}
                                        </TableHead>
                                        <TableHead>
                                            {t('privacy.consents.source')}
                                        </TableHead>
                                        <TableHead>
                                            {t('core.labels.date')}
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {props.consents.map((consent) => (
                                        <TableRow key={consent.id}>
                                            <TableCell>
                                                {consent.label}
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge
                                                    status={
                                                        consent.granted
                                                            ? 'granted'
                                                            : 'withdrawn'
                                                    }
                                                    tone={
                                                        consent.granted
                                                            ? 'success'
                                                            : 'muted'
                                                    }
                                                    label={
                                                        consent.granted
                                                            ? t(
                                                                  'members.admin.consents.granted',
                                                              )
                                                            : t(
                                                                  'members.admin.consents.withdrawn',
                                                              )
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell>
                                                {consent.version ? (
                                                    <Code>
                                                        {consent.version}
                                                    </Code>
                                                ) : (
                                                    '—'
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {t(
                                                    `members.admin.consents.sources.${consent.source}`,
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <DateTime
                                                    value={consent.created_at}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </SectionCard>
                </TabsContent>

                <TabsContent value="security">
                    <SectionCard
                        title={t('members.admin.security.title')}
                        flush
                    >
                        {props.security_events === null ? (
                            <div className="p-4">
                                <ErrorState
                                    kind="permission"
                                    description={t(
                                        'members.admin.security.no_permission',
                                    )}
                                />
                            </div>
                        ) : props.security_events.length === 0 ? (
                            <div className="p-4">
                                <EmptyState
                                    icon={ShieldAlert}
                                    title={t('members.admin.security.empty')}
                                />
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>
                                            {t('members.admin.security.event')}
                                        </TableHead>
                                        <TableHead>
                                            {t(
                                                'members.admin.security.severity',
                                            )}
                                        </TableHead>
                                        <TableHead>
                                            {t('members.admin.membership.ip')}
                                        </TableHead>
                                        <TableHead>
                                            {t('core.labels.date')}
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {props.security_events.map((event) => (
                                        <TableRow key={event.id}>
                                            <TableCell>
                                                <Code>{event.event_type}</Code>
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge
                                                    status={event.severity}
                                                    tone={
                                                        event.severity ===
                                                        'critical'
                                                            ? 'danger'
                                                            : event.severity ===
                                                                'warning'
                                                              ? 'warning'
                                                              : 'info'
                                                    }
                                                    label={t(
                                                        `members.admin.security.severities.${event.severity}`,
                                                    )}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                {event.ip_address ? (
                                                    <Code>
                                                        {event.ip_address}
                                                    </Code>
                                                ) : (
                                                    '—'
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <DateTime
                                                    value={event.created_at}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </SectionCard>
                </TabsContent>

                <TabsContent value="deletion">
                    <SectionCard
                        title={t('members.admin.deletion.title')}
                        flush
                        actions={
                            can('members.delete_requests') &&
                            props.deletion_requests.length > 0 ? (
                                <Button asChild size="sm" variant="outline">
                                    <Link
                                        href={deletionRequestsIndex.url({
                                            query: {
                                                search: membership.member_number,
                                            },
                                        })}
                                    >
                                        {t('members.admin.deletion.manage')}
                                    </Link>
                                </Button>
                            ) : null
                        }
                    >
                        {props.deletion_requests.length === 0 ? (
                            <div className="p-4">
                                <EmptyState
                                    title={t('members.admin.deletion.empty')}
                                />
                            </div>
                        ) : (
                            <ul className="divide-y">
                                {props.deletion_requests.map((request) => (
                                    <li
                                        key={request.id}
                                        className="grid gap-1 px-4 py-3 text-sm md:px-6"
                                    >
                                        <div className="flex flex-wrap items-center gap-2">
                                            <DeletionStatusBadge
                                                status={request.status}
                                            />
                                            <span className="text-muted-foreground">
                                                {t(
                                                    'members.admin.deletion_requests.requested_at',
                                                )}
                                                :{' '}
                                                <DateTime
                                                    value={request.requested_at}
                                                />
                                            </span>
                                        </div>
                                        {request.reason ? (
                                            <p>
                                                <span className="text-muted-foreground">
                                                    {t(
                                                        'members.admin.deletion_requests.reason',
                                                    )}
                                                    :{' '}
                                                </span>
                                                {request.reason}
                                            </p>
                                        ) : null}
                                        {request.processed_at ? (
                                            <p className="text-muted-foreground">
                                                {t(
                                                    'members.admin.deletion_requests.processed_at',
                                                )}
                                                :{' '}
                                                <DateTime
                                                    value={request.processed_at}
                                                />
                                                {request.processed_by
                                                    ? ` · ${request.processed_by}`
                                                    : ''}
                                            </p>
                                        ) : null}
                                        {request.notes ? (
                                            <p className="text-muted-foreground">
                                                {request.notes}
                                            </p>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </SectionCard>
                </TabsContent>
            </Tabs>

            <ConfirmDialog
                open={confirm === 'rotate'}
                onOpenChange={(open) =>
                    !open && !processing ? setConfirm(null) : undefined
                }
                title={t('members.admin.confirm.rotate_title')}
                description={t('members.admin.confirm.rotate_text')}
                confirmLabel={t('members.admin.actions.rotate_token')}
                processing={processing}
                onConfirm={() => post(rotateToken(membership.id).url)}
            />
            <ConfirmDialog
                open={confirm === 'resend'}
                onOpenChange={(open) =>
                    !open && !processing ? setConfirm(null) : undefined
                }
                title={t('members.admin.confirm.resend_title')}
                description={t('members.admin.confirm.resend_text', {
                    email: membership.user.email,
                })}
                confirmLabel={t('members.admin.actions.resend_verification')}
                processing={processing}
                onConfirm={() => post(resendVerification(membership.id).url)}
            />
        </>
    );
}

function MembershipTab({
    membership,
    history,
    verifications,
    referrals,
    onRotate,
}: Props & { onRotate: () => void }) {
    const timeline: TimelineItem[] = history.map((entry) => ({
        id: entry.id,
        title: entry.from
            ? t('members.admin.membership.transition', {
                  from: t(`members.status.${entry.from}`),
                  to: t(`members.status.${entry.to}`),
              })
            : t('members.admin.membership.initial', {
                  to: t(`members.status.${entry.to}`),
              }),
        description: entry.reason,
        at: entry.created_at,
        actor: entry.changed_by ?? t('members.admin.membership.system'),
        tone:
            membershipTone(entry.to) === 'success'
                ? 'success'
                : membershipTone(entry.to) === 'warning'
                  ? 'warning'
                  : membershipTone(entry.to) === 'danger'
                    ? 'danger'
                    : 'muted',
    }));

    return (
        <>
            <div className="grid gap-4 lg:grid-cols-3">
                <SectionCard
                    title={t('members.admin.membership.title')}
                    className="lg:col-span-2"
                    actions={
                        membership.abilities.rotateToken ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={onRotate}
                            >
                                <KeyRound
                                    className="size-4"
                                    aria-hidden="true"
                                />
                                {t('members.admin.actions.rotate_token')}
                            </Button>
                        ) : null
                    }
                >
                    <DescriptionList
                        items={[
                            {
                                label: t('members.card.member_number'),
                                value: membership.member_number,
                                type: 'code',
                            },
                            {
                                label: t('core.labels.status'),
                                value: (
                                    <MembershipStatusBadge
                                        status={membership.status}
                                    />
                                ),
                            },
                            {
                                label: t('members.card.member_since'),
                                value: membership.joined_at,
                                type: 'datetime',
                            },
                            {
                                label: t(
                                    'members.admin.membership.approved_at',
                                ),
                                value: membership.approved_at,
                                type: 'datetime',
                            },
                            {
                                label: t(
                                    'members.admin.membership.approved_by',
                                ),
                                value: membership.approved_by,
                            },
                            {
                                label: t(
                                    'members.admin.membership.suspended_at',
                                ),
                                value: membership.suspended_at,
                                type: 'datetime',
                                hidden: membership.suspended_at === null,
                            },
                            {
                                label: t('members.admin.membership.expires_at'),
                                value: membership.expires_at,
                                type: 'date',
                            },
                            {
                                label: t(
                                    'members.admin.membership.referral_code',
                                ),
                                value: membership.referral_code,
                                type: 'code',
                            },
                            {
                                label: t(
                                    'members.admin.membership.referred_by',
                                ),
                                value: membership.referred_by ? (
                                    <Link
                                        href={
                                            show(membership.referred_by.id).url
                                        }
                                        className="hover:underline"
                                    >
                                        {membership.referred_by.name ?? '—'}{' '}
                                        <Code>
                                            {
                                                membership.referred_by
                                                    .member_number
                                            }
                                        </Code>
                                    </Link>
                                ) : null,
                            },
                            {
                                label: t(
                                    'members.admin.membership.referral_source',
                                ),
                                value: membership.referral_source,
                            },
                            {
                                label: t(
                                    'members.admin.membership.qr_rotated_at',
                                ),
                                value: membership.qr_rotated_at,
                                type: 'datetime',
                            },
                        ]}
                    />
                </SectionCard>
                <SectionCard title={t('members.admin.membership.history')}>
                    {timeline.length > 0 ? (
                        <Timeline items={timeline} dense absolute />
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            {t('members.admin.membership.no_history')}
                        </p>
                    )}
                </SectionCard>
            </div>

            <SectionCard
                title={t('members.admin.membership.verifications')}
                flush
            >
                {verifications.length === 0 ? (
                    <div className="p-4">
                        <EmptyState
                            title={t(
                                'members.admin.membership.no_verifications',
                            )}
                        />
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('core.labels.date')}</TableHead>
                                <TableHead>
                                    {t('members.admin.membership.purpose')}
                                </TableHead>
                                <TableHead>
                                    {t('members.admin.membership.result')}
                                </TableHead>
                                <TableHead>
                                    {t('members.admin.membership.verified_by')}
                                </TableHead>
                                <TableHead>
                                    {t('members.admin.membership.ip')}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {verifications.map((verification) => (
                                <TableRow key={verification.id}>
                                    <TableCell>
                                        <DateTime
                                            value={verification.created_at}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {t(
                                            `members.verification.purpose.${verification.purpose}`,
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <VerificationResultBadge
                                            result={verification.result}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {verification.verified_by ??
                                            t(
                                                'members.admin.membership.anonymous',
                                            )}
                                    </TableCell>
                                    <TableCell>
                                        {verification.ip_address ? (
                                            <Code>
                                                {verification.ip_address}
                                            </Code>
                                        ) : (
                                            '—'
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </SectionCard>

            {referrals ? (
                <SectionCard title={t('members.admin.membership.referrals')}>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <StatCard
                            label={t('referrals.stats.invited')}
                            value={referrals.stats.invited}
                        />
                        <StatCard
                            label={t('referrals.stats.registered')}
                            value={referrals.stats.registered}
                        />
                        <StatCard
                            label={t('referrals.stats.approved')}
                            value={referrals.stats.approved}
                            tone="success"
                        />
                    </div>
                    {referrals.list.length > 0 ? (
                        <ul className="mt-4 divide-y rounded-lg border">
                            {referrals.list.map((referred) => (
                                <li
                                    key={referred.id}
                                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                                >
                                    <Link
                                        href={show(referred.id).url}
                                        className="hover:underline"
                                    >
                                        {referred.name ?? '—'}{' '}
                                        <Code>{referred.member_number}</Code>
                                    </Link>
                                    <span className="flex items-center gap-2">
                                        <ReferralStatusBadge
                                            status={referred.status}
                                        />
                                        <DateTime
                                            value={referred.created_at}
                                            mode="date"
                                            className="text-xs text-muted-foreground"
                                        />
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </SectionCard>
            ) : null}
        </>
    );
}

AdminMemberShow.layout = (props: Props) => ({
    breadcrumbs: [
        { title: t('members.admin.title'), href: index.url() },
        {
            title: props.membership.member_number,
            href: show(props.membership.id).url,
        },
    ],
});
