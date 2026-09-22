import { Link } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { DateTime } from '@/components/shared/date-time';
import { ErrorState } from '@/components/shared/error-state';
import { SkeletonForm } from '@/components/shared/skeletons';
import { CopyButton } from '@/components/shared/copy-button';
import { Code } from '@/components/ui/code';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { humanize, tOr } from '@/features/system/i18n';
import { t, useLocale } from '@/lib/i18n';
import { index as auditIndex, show as auditShow } from '@/routes/admin/audit-logs';

export type AuditSummary = {
    id: number;
    action: string;
    actor: { id: string; name: string; email: string } | null;
    actor_type: string;
    entity_type: string | null;
    entity_type_full: string | null;
    entity_id: number | null;
    entity_label: string | null;
    has_changes: boolean;
    reason: string | null;
    request_id: string | null;
    created_at: string | null;
};

export type AuditDetail = AuditSummary & {
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    ip_address: string | null;
    user_agent: string | null;
};

const REDACTED = '[redacted]';

function ValueCell({ value }: { value: unknown }) {
    if (value === REDACTED) {
        return <span className="text-xs text-muted-foreground italic">{t('audit.logs.detail.redacted')}</span>;
    }
    if (value === undefined || value === null || value === '') {
        return <span className="text-xs text-muted-foreground">{t('audit.logs.detail.empty_value')}</span>;
    }
    const text = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    return (
        <pre className="max-h-40 overflow-auto font-mono text-xs break-all whitespace-pre-wrap" dir="ltr">
            {text}
        </pre>
    );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="grid gap-0.5">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className="text-sm break-words">{children}</dd>
        </div>
    );
}

/** Side drawer with the full audit entry (old/new diff, reason, IP, device), fetched on demand as JSON. */
export function AuditDetailSheet({ entry, onClose }: { entry: AuditSummary | null; onClose: () => void }) {
    const { isRtl } = useLocale();
    const [detail, setDetail] = useState<AuditDetail | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!entry) {
            return;
        }
        const controller = new AbortController();
        setDetail(null);
        setFailed(false);
        fetch(auditShow(entry.id).url, { headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin', signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(String(response.status));
                }
                const body = (await response.json()) as { data: AuditDetail };
                setDetail(body.data);
            })
            .catch((error: unknown) => {
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                    setFailed(true);
                }
            });
        return () => controller.abort();
    }, [entry, attempt]);

    const keys = detail ? Array.from(new Set([...Object.keys(detail.old_values ?? {}), ...Object.keys(detail.new_values ?? {})])) : [];

    return (
        <Sheet open={entry !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
            <SheetContent side={isRtl ? 'left' : 'right'} className="w-full overflow-y-auto sm:max-w-xl">
                <SheetHeader>
                    <SheetTitle>{entry ? t('audit.logs.detail.title', { id: entry.id }) : ''}</SheetTitle>
                    <SheetDescription>{entry ? <Code>{entry.action}</Code> : null}</SheetDescription>
                </SheetHeader>
                <div className="grid gap-6 px-4 pb-6">
                    {failed ? (
                        <ErrorState title={t('audit.logs.detail.error')} onRetry={() => setAttempt((value) => value + 1)} />
                    ) : !detail ? (
                        <SkeletonForm fields={5} />
                    ) : (
                        <>
                            <dl className="grid gap-3 sm:grid-cols-2">
                                <Row label={t('audit.logs.columns.created_at')}>
                                    <DateTime value={detail.created_at} />
                                </Row>
                                <Row label={t('audit.logs.detail.actor')}>
                                    {detail.actor ? (
                                        <span>
                                            {detail.actor.name}{' '}
                                            <span className="text-xs text-muted-foreground" dir="ltr">
                                                {detail.actor.email}
                                            </span>
                                        </span>
                                    ) : (
                                        tOr(`audit.logs.actor_types.${detail.actor_type}`, humanize(detail.actor_type))
                                    )}
                                </Row>
                                <Row label={t('audit.logs.detail.entity')}>
                                    {detail.entity_type ? (
                                        <span className="flex flex-wrap items-center gap-1">
                                            <Code>{detail.entity_type}</Code>
                                            {detail.entity_id !== null ? <Code>#{detail.entity_id}</Code> : null}
                                            {detail.entity_label ? <span>{detail.entity_label}</span> : null}
                                        </span>
                                    ) : (
                                        (detail.entity_label ?? '—')
                                    )}
                                </Row>
                                <Row label={t('audit.logs.detail.reason')}>{detail.reason ?? '—'}</Row>
                                <Row label={t('audit.logs.detail.ip')}>{detail.ip_address ? <Code>{detail.ip_address}</Code> : '—'}</Row>
                                <Row label={t('audit.logs.detail.request_id')}>
                                    {detail.request_id ? (
                                        <span className="flex items-center gap-1">
                                            <Code className="text-[0.7rem]">{detail.request_id}</Code>
                                            <CopyButton value={detail.request_id} />
                                        </span>
                                    ) : (
                                        '—'
                                    )}
                                </Row>
                                <div className="sm:col-span-2">
                                    <Row label={t('audit.logs.detail.user_agent')}>
                                        <span className="text-xs break-all" dir="ltr">
                                            {detail.user_agent ?? '—'}
                                        </span>
                                    </Row>
                                </div>
                            </dl>

                            <section className="grid gap-2" aria-label={t('audit.logs.detail.changes')}>
                                <h3 className="text-sm font-medium">{t('audit.logs.detail.changes')}</h3>
                                {keys.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">{t('audit.logs.detail.no_changes')}</p>
                                ) : (
                                    <div className="overflow-x-auto rounded-lg border">
                                        <table className="w-full text-sm">
                                            <thead className="bg-muted/40">
                                                <tr>
                                                    <th scope="col" className="px-3 py-2 text-start font-medium">
                                                        {t('audit.logs.detail.field')}
                                                    </th>
                                                    <th scope="col" className="px-3 py-2 text-start font-medium">
                                                        {t('audit.logs.detail.old')}
                                                    </th>
                                                    <th scope="col" className="px-3 py-2 text-start font-medium">
                                                        {t('audit.logs.detail.new')}
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {keys.map((key) => (
                                                    <tr key={key} className="border-t align-top">
                                                        <th scope="row" className="px-3 py-2 text-start font-normal">
                                                            <Code className="text-[0.7rem]">{key}</Code>
                                                        </th>
                                                        <td className="bg-danger-soft/20 px-3 py-2">
                                                            <ValueCell value={detail.old_values?.[key]} />
                                                        </td>
                                                        <td className="bg-success-soft/20 px-3 py-2">
                                                            <ValueCell value={detail.new_values?.[key]} />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>

                            <div className="flex flex-wrap gap-3 text-sm">
                                {detail.request_id ? (
                                    <Link href={auditIndex({ query: { request_id: detail.request_id } }).url} className="font-medium text-brand hover:underline" onClick={onClose}>
                                        {t('audit.logs.detail.filter_request')}
                                    </Link>
                                ) : null}
                                {detail.entity_type_full && detail.entity_id !== null ? (
                                    <Link
                                        href={auditIndex({ query: { entity_type: detail.entity_type_full, entity_id: String(detail.entity_id) } }).url}
                                        className="font-medium text-brand hover:underline"
                                        onClick={onClose}
                                    >
                                        {t('audit.logs.detail.filter_entity')}
                                    </Link>
                                ) : null}
                            </div>
                        </>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
