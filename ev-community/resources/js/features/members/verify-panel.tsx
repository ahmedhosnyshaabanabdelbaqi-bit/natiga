import { Link, useHttp } from '@inertiajs/react';
import {
    CheckCircle2,
    CircleAlert,
    Clock,
    RotateCcw,
    ScanLine,
    ShieldX,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useEffectEvent, useState } from 'react';
import { DateTime } from '@/components/shared/date-time';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { QrScanner } from '@/components/shared/qr-scanner';
import { SectionCard } from '@/components/shared/section-card';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { RouteDefinition } from '@/wayfinder';
import { MembershipStatusBadge } from './status';
import type { Option, VerifyOutcome, VerifyResponse } from './types';

type Props = {
    action: RouteDefinition<'post'>;
    purposes: Option[];
    /** Partner scanners only ever receive name, member number and status. */
    audience: 'admin' | 'partner';
};

type Result = { outcome: VerifyOutcome; message: string; checkedAt: string };

/**
 * Scan (camera) or paste a membership token, verify it server-side and show the outcome.
 * Every attempt is logged by the server with the chosen purpose.
 */
export function VerifyPanel({ action, purposes, audience }: Props) {
    const http = useHttp<{ token: string; purpose: string }, VerifyResponse>({
        token: '',
        purpose: purposes[0]?.value ?? 'membership',
    });
    const [result, setResult] = useState<Result | null>(null);
    const [failure, setFailure] = useState<string | null>(null);
    const [autoSubmit, setAutoSubmit] = useState(false);

    const submit = () => {
        setFailure(null);
        void http
            .post(action.url, {
                onSuccess: (response) =>
                    setResult({
                        outcome: response.data,
                        message: response.message,
                        checkedAt: new Date().toISOString(),
                    }),
                onHttpException: () => {
                    setFailure(t('members.admin.scan.error'));
                    return false;
                },
                onNetworkError: () => {
                    setFailure(t('core.states.connection_error'));
                    return false;
                },
            })
            .catch(() => undefined);
    };

    // A camera read fills the token field; submit once the state holds the scanned value.
    const submitScanned = useEffectEvent(() => {
        setAutoSubmit(false);
        submit();
    });
    useEffect(() => {
        if (autoSubmit && http.data.token !== '') {
            submitScanned();
        }
    }, [autoSubmit, http.data.token]);

    const onScan = (text: string) => {
        setResult(null);
        http.setData('token', text.trim());
        setAutoSubmit(true);
    };

    const onSubmit = (event: FormEvent) => {
        event.preventDefault();
        setResult(null);
        submit();
    };

    const reset = () => {
        setResult(null);
        setFailure(null);
        http.reset('token');
        http.clearErrors();
    };

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard
                title={t('members.admin.scan.title')}
                description={t('members.admin.scan.description')}
            >
                <form onSubmit={onSubmit} className="grid gap-4" noValidate>
                    <FormField
                        label={t('members.admin.scan.purpose')}
                        error={http.errors.purpose}
                    >
                        {(control) => (
                            <Select
                                value={http.data.purpose}
                                onValueChange={(value) =>
                                    http.setData('purpose', value)
                                }
                            >
                                <SelectTrigger {...control} className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {purposes.map((purpose) => (
                                        <SelectItem
                                            key={purpose.value}
                                            value={purpose.value}
                                        >
                                            {purpose.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </FormField>
                    {/* Scanning pauses while a request runs and while a result is shown ("scan again" resumes),
                        so a card held in front of the camera is verified and logged once. */}
                    <QrScanner
                        onScan={onScan}
                        paused={http.processing || result !== null}
                        manualEntry={false}
                        autoStart={false}
                    />
                    <FormField
                        label={t('members.admin.scan.token')}
                        hint={t('members.admin.scan.manual')}
                        error={http.errors.token}
                        required
                    >
                        <Input
                            value={http.data.token}
                            onChange={(event) =>
                                http.setData('token', event.target.value)
                            }
                            dir="ltr"
                            autoComplete="off"
                            spellCheck={false}
                            className="font-mono text-xs"
                        />
                    </FormField>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="submit"
                            disabled={
                                http.processing || http.data.token.trim() === ''
                            }
                        >
                            {http.processing ? (
                                <Spinner />
                            ) : (
                                <ScanLine
                                    className="size-4"
                                    aria-hidden="true"
                                />
                            )}
                            {t('members.admin.scan.verify')}
                        </Button>
                        {result || http.data.token !== '' ? (
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={reset}
                            >
                                <RotateCcw
                                    className="size-4"
                                    aria-hidden="true"
                                />
                                {t('members.admin.scan.scan_again')}
                            </Button>
                        ) : null}
                    </div>
                    {failure ? (
                        <InlineAlert tone="danger">{failure}</InlineAlert>
                    ) : null}
                </form>
            </SectionCard>

            <SectionCard title={t('members.admin.scan.result')}>
                <div aria-live="polite">
                    {result ? (
                        <ResultView result={result} audience={audience} />
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            {t('members.admin.scan.waiting')}
                        </p>
                    )}
                </div>
            </SectionCard>
        </div>
    );
}

function ResultView({
    result,
    audience,
}: {
    result: Result;
    audience: 'admin' | 'partner';
}) {
    const { outcome, message } = result;
    const reason = outcome.valid ? 'valid' : (outcome.reason ?? 'invalid');
    const Icon =
        reason === 'valid'
            ? CheckCircle2
            : reason === 'expired'
              ? Clock
              : reason === 'not_active'
                ? CircleAlert
                : ShieldX;
    const tone =
        reason === 'valid'
            ? 'border-success/40 bg-success-soft/50 text-success'
            : reason === 'expired'
              ? 'border-warning/40 bg-warning-soft/50 text-warning'
              : 'border-danger/40 bg-danger-soft/50 text-danger';
    const member = outcome.member;

    return (
        <div className="grid gap-4">
            <div
                className={cn(
                    'flex items-start gap-3 rounded-xl border p-4',
                    tone,
                )}
            >
                <Icon className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                    <p className="text-base font-semibold">
                        {t(`members.verification.result.${reason}`)}
                    </p>
                    <p className="text-sm opacity-90">{message}</p>
                </div>
            </div>
            {member ? (
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                        <dt className="text-xs text-muted-foreground">
                            {t('members.partner.member')}
                        </dt>
                        <dd className="mt-0.5 font-medium">{member.name}</dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted-foreground">
                            {t('members.card.member_number')}
                        </dt>
                        <dd className="mt-0.5">
                            <Code>{member.member_number}</Code>
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted-foreground">
                            {t('members.partner.status')}
                        </dt>
                        <dd className="mt-0.5">
                            <MembershipStatusBadge status={member.status} />
                        </dd>
                    </div>
                    {audience === 'admin' ? (
                        <>
                            <div>
                                <dt className="text-xs text-muted-foreground">
                                    {t('members.card.governorate')}
                                </dt>
                                <dd className="mt-0.5">
                                    {member.governorate ?? '—'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-muted-foreground">
                                    {t('members.card.member_since')}
                                </dt>
                                <dd className="mt-0.5">
                                    <DateTime
                                        value={member.joined_at ?? null}
                                        mode="date"
                                    />
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-muted-foreground">
                                    {t('members.card.valid_until')}
                                </dt>
                                <dd className="mt-0.5">
                                    <DateTime
                                        value={member.expires_at ?? null}
                                        mode="date"
                                    />
                                </dd>
                            </div>
                        </>
                    ) : null}
                </dl>
            ) : null}
            <p className="text-xs text-muted-foreground">
                {t('members.public_verify.checked_at')}:{' '}
                <DateTime value={result.checkedAt} />
            </p>
            {audience === 'admin' && member?.url ? (
                <div>
                    <Button asChild variant="outline" size="sm">
                        <Link href={member.url}>
                            {t('members.admin.actions.open_member')}
                        </Link>
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
