import { Head } from '@inertiajs/react';
import { CheckCircle2, CircleAlert, Clock, ShieldX } from 'lucide-react';
import { DateTime } from '@/components/shared/date-time';
import { Card, CardContent } from '@/components/ui/card';
import { Code } from '@/components/ui/code';
import type { VerificationResult } from '@/features/members/types';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = {
    result: VerificationResult;
    member_number_masked: string | null;
    checked_at: string;
};

const VIEW: Record<
    VerificationResult,
    { icon: typeof CheckCircle2; tone: string }
> = {
    valid: { icon: CheckCircle2, tone: 'bg-success-soft text-success' },
    expired: { icon: Clock, tone: 'bg-warning-soft text-warning' },
    not_active: { icon: CircleAlert, tone: 'bg-danger-soft text-danger' },
    invalid: { icon: ShieldX, tone: 'bg-danger-soft text-danger' },
};

/** Public QR landing page: only the verification result and a masked member number are shown. */
export default function PublicVerify({
    result,
    member_number_masked: masked,
    checked_at: checkedAt,
}: Props) {
    const view = VIEW[result] ?? VIEW.invalid;
    const Icon = view.icon;

    return (
        <>
            <Head title={t('members.public_verify.title')}>
                <meta name="robots" content="noindex, nofollow" />
                <meta name="referrer" content="no-referrer" />
            </Head>
            <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10 sm:py-16">
                <Card className="shadow-elevated">
                    <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
                        <div
                            className={cn(
                                'flex size-16 items-center justify-center rounded-full',
                                view.tone,
                            )}
                        >
                            <Icon className="size-8" aria-hidden="true" />
                        </div>
                        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            {t('members.public_verify.title')}
                        </p>
                        <h1
                            className="text-2xl font-semibold"
                            aria-live="polite"
                        >
                            {t(`members.public_verify.${result}`)}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {t(`members.public_verify.${result}_text`)}
                        </p>
                        {masked ? (
                            <div className="grid gap-1">
                                <span className="text-xs text-muted-foreground">
                                    {t('members.public_verify.member_number')}
                                </span>
                                <Code className="text-lg tracking-widest">
                                    {masked}
                                </Code>
                            </div>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                            {t('members.public_verify.checked_at')}:{' '}
                            <DateTime value={checkedAt} />
                        </p>
                        <p className="border-t pt-4 text-xs text-muted-foreground">
                            {t('members.public_verify.note')}
                        </p>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
