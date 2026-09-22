import { Head, Link, usePage } from '@inertiajs/react';
import {
    CalendarX,
    Clock,
    LogOut,
    Mail,
    Phone,
    ShieldOff,
    UserRound,
    XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Code } from '@/components/ui/code';
import { MembershipStatusBadge } from '@/features/members/status';
import type { MembershipStatus as Status } from '@/features/members/types';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { logout } from '@/routes';
import { status as statusRoute } from '@/routes/member';
import { edit as profileEdit } from '@/routes/member/profile';

const VIEW: Record<
    Exclude<Status, 'active'>,
    { icon: LucideIcon; tone: string }
> = {
    pending: { icon: Clock, tone: 'bg-warning-soft text-warning' },
    suspended: { icon: ShieldOff, tone: 'bg-danger-soft text-danger' },
    rejected: { icon: XCircle, tone: 'bg-danger-soft text-danger' },
    expired: { icon: CalendarX, tone: 'bg-muted text-muted-foreground' },
};

/** Landing page for members whose membership is not active (the portal redirects every other page here). */
export default function MembershipStatusPage() {
    const { auth, branding } = usePage().props;
    const membership = auth.user?.membership ?? null;
    const status: Exclude<Status, 'active'> =
        membership && membership.status !== 'active'
            ? membership.status
            : 'pending';
    const view = VIEW[status];
    const Icon = view.icon;
    const contact = branding.contact;

    return (
        <>
            <Head title={t(`members.status_page.${status}_title`)} />
            <Card className="mx-auto mt-8 w-full max-w-lg shadow-card">
                <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
                    <div
                        className={cn(
                            'flex size-14 items-center justify-center rounded-full',
                            view.tone,
                        )}
                    >
                        <Icon className="size-7" aria-hidden="true" />
                    </div>
                    <h1 className="text-xl font-semibold">
                        {t(`members.status_page.${status}_title`)}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {t(`members.status_page.${status}_text`)}
                    </p>
                    {membership ? (
                        <p className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
                            {t('core.labels.member')}:{' '}
                            <Code>{membership.member_number}</Code>
                            <MembershipStatusBadge status={membership.status} />
                        </p>
                    ) : null}
                    {contact.email || contact.phone ? (
                        <div className="grid gap-1 text-sm">
                            <p className="text-muted-foreground">
                                {t('members.status_page.contact')}
                            </p>
                            {contact.email ? (
                                <a
                                    href={`mailto:${contact.email}`}
                                    className="inline-flex items-center justify-center gap-2 text-brand hover:underline"
                                    dir="ltr"
                                >
                                    <Mail
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {contact.email}
                                </a>
                            ) : null}
                            {contact.phone ? (
                                <a
                                    href={`tel:${contact.phone}`}
                                    className="inline-flex items-center justify-center gap-2 text-brand hover:underline"
                                    dir="ltr"
                                >
                                    <Phone
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {contact.phone}
                                </a>
                            ) : null}
                        </div>
                    ) : null}
                    <div className="flex flex-wrap justify-center gap-2 pt-2">
                        {status === 'pending' ? (
                            <Button asChild variant="outline" size="sm">
                                <Link href={profileEdit.url()}>
                                    <UserRound
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {t('members.status_page.complete_profile')}
                                </Link>
                            </Button>
                        ) : null}
                        <Button asChild variant="ghost" size="sm">
                            <Link href={logout()} as="button">
                                <LogOut className="size-4" aria-hidden="true" />
                                {t('core.nav.logout')}
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </>
    );
}

MembershipStatusPage.layout = () => ({
    breadcrumbs: [
        { title: t('members.status_page.breadcrumb'), href: statusRoute.url() },
    ],
});
