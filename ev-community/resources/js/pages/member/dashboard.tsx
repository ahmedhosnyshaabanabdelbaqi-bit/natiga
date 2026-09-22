import { Head, Link, usePage } from '@inertiajs/react';
import {
    Car,
    ChevronRight,
    IdCard,
    ShieldCheck,
    UserRound,
    UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DateTime } from '@/components/shared/date-time';
import { InlineAlert } from '@/components/shared/inline-alert';
import { KpiGrid, type Kpi } from '@/components/shared/kpi-grid';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Code } from '@/components/ui/code';
import { MembershipStatusBadge } from '@/features/members/status';
import type { MembershipStatus } from '@/features/members/types';
import { t } from '@/lib/i18n';
import { dashboard, membershipCard } from '@/routes/member';
import { index as privacyIndex } from '@/routes/member/privacy';
import { edit as profileEdit } from '@/routes/member/profile';
import { index as referralsIndex } from '@/routes/member/referrals';

type Props = {
    membership: {
        member_number: string;
        status: MembershipStatus;
        joined_at: string | null;
    };
    kpis: Kpi[];
    profile: { mobile_missing: boolean; governorate_missing: boolean };
    referrals_enabled: boolean;
};

type QuickLink = { href: string; label: string; icon: LucideIcon };

export default function MemberDashboard({
    membership,
    kpis,
    profile,
    referrals_enabled: referralsEnabled,
}: Props) {
    const { auth, modules } = usePage().props;
    const incomplete = profile.mobile_missing || profile.governorate_missing;
    const links: QuickLink[] = [
        {
            href: profileEdit.url(),
            label: t('members.dashboard.profile'),
            icon: UserRound,
        },
        ...(referralsEnabled
            ? [
                  {
                      href: referralsIndex.url(),
                      label: t('members.dashboard.referrals'),
                      icon: UsersRound,
                  },
              ]
            : []),
        {
            href: privacyIndex.url(),
            label: t('members.dashboard.privacy'),
            icon: ShieldCheck,
        },
    ];

    return (
        <>
            <Head title={t('core.labels.dashboard')} />
            <PageHeader
                title={t('admin.dashboard.welcome', {
                    name: auth.user?.name ?? '',
                })}
                description={t('core.home.hero_title')}
            />
            {incomplete ? (
                <InlineAlert
                    tone="warning"
                    title={t('members.profile.complete_title')}
                    action={
                        <Button asChild size="sm" variant="outline">
                            <Link href={profileEdit.url()}>
                                {t('members.profile.complete_action')}
                            </Link>
                        </Button>
                    }
                >
                    {profile.mobile_missing && profile.governorate_missing
                        ? t('members.profile.complete_text')
                        : profile.mobile_missing
                          ? t('members.profile.complete_mobile')
                          : t('members.profile.complete_governorate')}
                </InlineAlert>
            ) : null}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="shadow-card md:col-span-2">
                    <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                        <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase">
                                {t('core.nav.membership_card')}
                            </p>
                            <p className="mt-1 text-lg font-semibold">
                                <Code>{membership.member_number}</Code>
                            </p>
                            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                <MembershipStatusBadge
                                    status={membership.status}
                                />
                                <span>
                                    {t('members.card.member_since')}{' '}
                                    <DateTime
                                        value={membership.joined_at}
                                        mode="date"
                                    />
                                </span>
                            </p>
                        </div>
                        <Button asChild variant="outline">
                            <Link href={membershipCard.url()}>
                                <IdCard className="size-4" aria-hidden="true" />
                                {t('core.nav.membership_card')}
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
                {modules.garage !== false ? (
                    <Card className="shadow-card">
                        <CardContent className="flex h-full flex-col justify-between gap-3 p-5">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase">
                                    {t('core.nav.my_garage')}
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {t('core.home.select_vehicle')}
                                </p>
                            </div>
                            <Button asChild>
                                <Link href="/account/garage">
                                    <Car
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {t('core.nav.my_garage')}
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                ) : null}
            </div>
            <KpiGrid kpis={kpis} />
            <SectionCard title={t('members.dashboard.quick_links')} flush>
                <ul className="divide-y">
                    {links.map((link) => (
                        <li key={link.href}>
                            <Link
                                href={link.href}
                                className="flex items-center gap-3 px-4 py-3 text-sm transition hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none md:px-6"
                                prefetch
                            >
                                <link.icon
                                    className="size-4 text-muted-foreground"
                                    aria-hidden="true"
                                />
                                <span className="flex-1">{link.label}</span>
                                <ChevronRight
                                    className="size-4 text-muted-foreground rtl:rotate-180"
                                    aria-hidden="true"
                                />
                            </Link>
                        </li>
                    ))}
                </ul>
            </SectionCard>
        </>
    );
}

MemberDashboard.layout = () => ({
    breadcrumbs: [{ title: t('core.labels.dashboard'), href: dashboard.url() }],
});
