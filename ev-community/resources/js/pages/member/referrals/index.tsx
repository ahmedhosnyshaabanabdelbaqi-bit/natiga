import { Head } from '@inertiajs/react';
import { MessageCircle, Share2, UsersRound } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { CopyButton } from '@/components/shared/copy-button';
import { DateTime } from '@/components/shared/date-time';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { StatCard } from '@/components/shared/stat-card';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ReferralStatusBadge } from '@/features/members/status';
import type { ReferralStats, ReferralStatus } from '@/features/members/types';
import { t } from '@/lib/i18n';
import { index } from '@/routes/member/referrals';

type Props = {
    referral_code: string;
    share_link: string;
    stats: ReferralStats;
    referred: {
        first_name: string;
        status: ReferralStatus;
        joined_at: string | null;
    }[];
};

const subscribeNothing = () => () => undefined;

/** Web Share API is only available on some (mostly mobile) browsers; the button is hidden elsewhere. */
function useCanShare(): boolean {
    return useSyncExternalStore(
        subscribeNothing,
        () =>
            typeof navigator !== 'undefined' &&
            typeof navigator.share === 'function',
        () => false,
    );
}

export default function MemberReferrals({
    referral_code: code,
    share_link: link,
    stats,
    referred,
}: Props) {
    const canShare = useCanShare();
    const shareText = t('referrals.share_text', { link });

    return (
        <>
            <Head title={t('referrals.title')} />
            <PageHeader
                title={t('referrals.title')}
                description={t('referrals.description')}
            />

            <div className="grid gap-4 lg:grid-cols-3">
                <SectionCard
                    title={t('referrals.code')}
                    className="lg:col-span-2"
                >
                    <div className="grid gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <Code className="px-3 py-1.5 text-xl tracking-widest">
                                {code}
                            </Code>
                            <CopyButton
                                value={code}
                                label={t('referrals.copy_code')}
                                showLabel
                                variant="outline"
                                size="sm"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="referral-link">
                                {t('referrals.share_link')}
                            </Label>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Input
                                    id="referral-link"
                                    value={link}
                                    readOnly
                                    dir="ltr"
                                    className="font-mono text-xs"
                                    onFocus={(event) =>
                                        event.currentTarget.select()
                                    }
                                />
                                <CopyButton
                                    value={link}
                                    label={t('referrals.copy_link')}
                                    showLabel
                                    variant="default"
                                    size="sm"
                                    className="h-9 shrink-0"
                                />
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button asChild variant="outline" size="sm">
                                <a
                                    href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <MessageCircle
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {t('referrals.share_whatsapp')}
                                </a>
                            </Button>
                            {canShare ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        void navigator
                                            .share({
                                                title: t('referrals.title'),
                                                text: shareText,
                                                url: link,
                                            })
                                            .catch(() => undefined);
                                    }}
                                >
                                    <Share2
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {t('referrals.share')}
                                </Button>
                            ) : null}
                        </div>
                    </div>
                </SectionCard>
                <div className="grid content-start gap-3">
                    <StatCard
                        label={t('referrals.stats.invited')}
                        value={stats.invited}
                        icon={UsersRound}
                    />
                    <StatCard
                        label={t('referrals.stats.registered')}
                        value={stats.registered}
                        tone="brand"
                    />
                    <StatCard
                        label={t('referrals.stats.approved')}
                        value={stats.approved}
                        tone="success"
                    />
                </div>
            </div>

            <SectionCard
                title={t('referrals.referred.title')}
                description={t('referrals.privacy_note')}
                flush
            >
                {referred.length === 0 ? (
                    <div className="p-4">
                        <EmptyState
                            icon={UsersRound}
                            title={t('referrals.referred.empty')}
                        />
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>
                                    {t('referrals.referred.name')}
                                </TableHead>
                                <TableHead>
                                    {t('referrals.referred.status')}
                                </TableHead>
                                <TableHead>
                                    {t('referrals.referred.date')}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {referred.map((row, position) => (
                                <TableRow key={`${row.first_name}-${position}`}>
                                    <TableCell className="font-medium">
                                        {row.first_name}
                                    </TableCell>
                                    <TableCell>
                                        <ReferralStatusBadge
                                            status={row.status}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <DateTime
                                            value={row.joined_at}
                                            mode="date"
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </SectionCard>
        </>
    );
}

MemberReferrals.layout = () => ({
    breadcrumbs: [{ title: t('referrals.title'), href: index.url() }],
});
