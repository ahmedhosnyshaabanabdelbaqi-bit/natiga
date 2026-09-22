import { Head, router, usePoll } from '@inertiajs/react';
import { KeyRound, Printer, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { CopyButton } from '@/components/shared/copy-button';
import { DateTime } from '@/components/shared/date-time';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import { Spinner } from '@/components/ui/spinner';
import { MembershipStatusBadge } from '@/features/members/status';
import type { MembershipStatus } from '@/features/members/types';
import { t } from '@/lib/i18n';
import { membershipCard } from '@/routes/member';
import { rotate } from '@/routes/member/membership-card';

type Card = {
    site_name: string;
    member_name: string;
    member_number: string;
    status: MembershipStatus;
    joined_at: string | null;
    expires_at: string | null;
    governorate: string | null;
    qr_rotated_at: string | null;
};

type Qr = {
    svg: string | null;
    token: string | null;
    verify_url: string | null;
    expires_at: string | null;
    ttl_minutes: number;
    refresh_seconds: number;
};

const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  #membership-card, #membership-card * { visibility: visible !important; }
  #membership-card { position: absolute; inset-inline-start: 0; top: 0; width: 100%; max-width: 640px; box-shadow: none !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

function secondsUntil(iso: string | null): number {
    if (!iso) {
        return 0;
    }
    return Math.max(
        0,
        Math.round((new Date(iso).getTime() - Date.now()) / 1000),
    );
}

function formatCountdown(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

export default function MembershipCardPage({
    card,
    qr,
}: {
    card: Card;
    qr: Qr;
}) {
    const active = card.status === 'active' && qr.svg !== null;
    const [remaining, setRemaining] = useState(() =>
        secondsUntil(qr.expires_at),
    );
    const [refreshing, setRefreshing] = useState(false);
    const [confirmRotate, setConfirmRotate] = useState(false);
    const [rotating, setRotating] = useState(false);

    const reloadQr = () => {
        setRefreshing(true);
        router.reload({ only: ['qr'], onFinish: () => setRefreshing(false) });
    };

    // Fetch a fresh signed token shortly before the current one expires.
    usePoll(
        Math.max(30, qr.refresh_seconds) * 1000,
        { only: ['qr'] },
        { autoStart: active },
    );

    const autoRefreshedFor = useRef<string | null>(null);
    const tick = useEffectEvent(() => {
        const next = secondsUntil(qr.expires_at);
        setRemaining(next);
        // One automatic refresh per issued code; a failed request is retried by the poll, not every second.
        if (
            active &&
            next === 0 &&
            !refreshing &&
            autoRefreshedFor.current !== qr.expires_at
        ) {
            autoRefreshedFor.current = qr.expires_at;
            reloadQr();
        }
    });
    useEffect(() => {
        tick();
        const timer = window.setInterval(() => tick(), 1000);
        return () => window.clearInterval(timer);
    }, [qr.expires_at]);

    // Coming back to the tab (phone unlocked at a partner desk) must show a valid code immediately.
    const onVisible = useEffectEvent(() => {
        if (
            document.visibilityState === 'visible' &&
            active &&
            secondsUntil(qr.expires_at) < 30
        ) {
            reloadQr();
        }
    });
    useEffect(() => {
        const listener = () => onVisible();
        document.addEventListener('visibilitychange', listener);
        return () => document.removeEventListener('visibilitychange', listener);
    }, []);

    const doRotate = () => {
        setRotating(true);
        router.post(
            rotate.url(),
            {},
            {
                preserveScroll: true,
                onSuccess: () => setConfirmRotate(false),
                onFinish: () => setRotating(false),
            },
        );
    };

    return (
        <>
            <Head title={t('members.card.title')} />
            <style>{PRINT_CSS}</style>
            <PageHeader
                title={t('members.card.title')}
                description={t('members.card.description')}
                actions={
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => window.print()}
                        className="print:hidden"
                    >
                        <Printer className="size-4" aria-hidden="true" />
                        {t('members.card.print')}
                    </Button>
                }
            />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
                <section
                    id="membership-card"
                    aria-label={t('members.card.title')}
                    className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0B1220] via-[#10223a] to-[#0F766E] p-5 text-white shadow-elevated sm:p-7"
                >
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -end-16 -top-16 size-56 rounded-full bg-white/5"
                    />
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -start-10 -bottom-20 size-64 rounded-full bg-[#0F766E]/30 blur-2xl"
                    />
                    <div className="relative flex flex-col gap-6 sm:flex-row sm:items-stretch sm:justify-between">
                        <div className="flex min-w-0 flex-1 flex-col justify-between gap-6">
                            <div className="flex items-center gap-2 text-sm font-semibold tracking-wide text-white/90">
                                <ShieldCheck
                                    className="size-5 text-emerald-300"
                                    aria-hidden="true"
                                />
                                <span className="truncate">
                                    {card.site_name}
                                </span>
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs text-white/60 uppercase">
                                    {t('members.card.member')}
                                </p>
                                <p className="mt-1 text-2xl leading-tight font-semibold break-words">
                                    {card.member_name}
                                </p>
                                <p className="mt-3 text-xs text-white/60 uppercase">
                                    {t('members.card.member_number')}
                                </p>
                                <Code className="mt-1 rounded-md bg-white/10 px-2 py-1 text-lg tracking-widest text-white">
                                    {card.member_number}
                                </Code>
                            </div>
                            <div className="flex flex-wrap items-end gap-x-6 gap-y-3 text-sm">
                                <div>
                                    <p className="text-xs text-white/60">
                                        {t('members.card.member_since')}
                                    </p>
                                    <DateTime
                                        value={card.joined_at}
                                        mode="date"
                                        className="font-medium"
                                    />
                                </div>
                                {card.expires_at ? (
                                    <div>
                                        <p className="text-xs text-white/60">
                                            {t('members.card.valid_until')}
                                        </p>
                                        <DateTime
                                            value={card.expires_at}
                                            mode="date"
                                            className="font-medium"
                                        />
                                    </div>
                                ) : null}
                                <MembershipStatusBadge
                                    status={card.status}
                                    className="bg-white/90"
                                />
                            </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-center gap-2 self-center">
                            {active && qr.svg ? (
                                <>
                                    <div
                                        className="size-44 rounded-xl bg-white p-2 shadow-lg sm:size-48 [&>svg]:size-full"
                                        role="img"
                                        aria-label={t('members.card.qr_label')}
                                        // The SVG is generated server-side (endroid/qr-code) from our own signed URL.
                                        dangerouslySetInnerHTML={{
                                            __html: qr.svg,
                                        }}
                                    />
                                    <p
                                        className="tabular text-xs text-white/70 print:hidden"
                                        aria-live="polite"
                                    >
                                        {refreshing
                                            ? t('members.card.qr_refreshing')
                                            : t('members.card.qr_expires_in', {
                                                  time: formatCountdown(
                                                      remaining,
                                                  ),
                                              })}
                                    </p>
                                </>
                            ) : (
                                <div className="flex size-44 items-center justify-center rounded-xl border border-white/20 bg-white/5 p-4 text-center text-sm text-white/80 sm:size-48">
                                    {t('members.card.not_active')}
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                <div className="grid content-start gap-4 print:hidden">
                    {!active ? (
                        <InlineAlert tone="warning">
                            {t('members.card.not_active')}
                        </InlineAlert>
                    ) : null}
                    <SectionCard title={t('members.card.how_title')}>
                        <ul className="grid gap-2 text-sm text-muted-foreground">
                            <li>{t('members.card.how_it_works')}</li>
                            <li>{t('members.card.privacy_note')}</li>
                            <li>{t('members.card.verify_hint')}</li>
                        </ul>
                    </SectionCard>
                    {active ? (
                        <SectionCard
                            title={t('members.card.code_title')}
                            description={t('members.card.code_description', {
                                minutes: qr.ttl_minutes,
                            })}
                        >
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={reloadQr}
                                    disabled={refreshing}
                                >
                                    {refreshing ? (
                                        <Spinner />
                                    ) : (
                                        <RefreshCw
                                            className="size-4"
                                            aria-hidden="true"
                                        />
                                    )}
                                    {t('members.card.refresh_now')}
                                </Button>
                                {qr.verify_url ? (
                                    <CopyButton
                                        value={qr.verify_url}
                                        label={t('members.card.copy_link')}
                                        showLabel
                                        variant="outline"
                                        size="sm"
                                    />
                                ) : null}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setConfirmRotate(true)}
                                >
                                    <KeyRound
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {t('members.card.rotate')}
                                </Button>
                            </div>
                            {card.qr_rotated_at ? (
                                <p className="mt-3 text-xs text-muted-foreground">
                                    {t('members.card.rotated_at')}:{' '}
                                    <DateTime value={card.qr_rotated_at} />
                                </p>
                            ) : null}
                        </SectionCard>
                    ) : null}
                </div>
            </div>

            <ConfirmDialog
                open={confirmRotate}
                onOpenChange={(open) =>
                    !open && !rotating ? setConfirmRotate(false) : undefined
                }
                title={t('members.card.rotate_title')}
                description={t('members.card.rotate_text')}
                confirmLabel={t('members.card.rotate')}
                processing={rotating}
                onConfirm={doRotate}
            />
        </>
    );
}

MembershipCardPage.layout = () => ({
    breadcrumbs: [
        { title: t('members.card.title'), href: membershipCard.url() },
    ],
});
