import { LogOut, Monitor, Smartphone } from 'lucide-react';
import { DateTime } from '@/components/shared/date-time';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SessionRow } from '@/features/system/types';
import { t } from '@/lib/i18n';

function isMobile(agent: string | null): boolean {
    return agent !== null && /iphone|ipad|android|mobile/i.test(agent);
}

/**
 * Active sessions (keys are opaque, never raw session ids). `onRevoke` is omitted when the viewer cannot revoke;
 * the current session is never revocable from the list (the normal logout does that).
 */
export function SessionsList({ sessions, onRevoke, emptyText }: { sessions: SessionRow[]; onRevoke?: (session: SessionRow) => void; emptyText: string }) {
    if (sessions.length === 0) {
        return <EmptyState icon={Monitor} title={emptyText} />;
    }
    return (
        <ul className="divide-y rounded-xl border bg-card">
            {sessions.map((session) => {
                const Icon = isMobile(session.user_agent) ? Smartphone : Monitor;
                return (
                    <li key={session.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                            <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                                    <span>{session.device || t('system.sessions.unknown_device')}</span>
                                    {session.is_current ? <Badge variant="secondary">{t('system.sessions.current')}</Badge> : null}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    <span dir="ltr">{session.ip_address ?? '—'}</span>
                                    <span aria-hidden="true"> · </span>
                                    <span>
                                        {t('users.labels.last_active')}: <DateTime value={session.last_activity} mode="relative" />
                                    </span>
                                </p>
                                {session.user_agent ? (
                                    <p className="mt-1 truncate text-xs text-muted-foreground" dir="ltr" title={session.user_agent}>
                                        {session.user_agent}
                                    </p>
                                ) : null}
                            </div>
                        </div>
                        {onRevoke && !session.is_current ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => onRevoke(session)} className="shrink-0">
                                <LogOut className="size-4 rtl:rotate-180" aria-hidden="true" />
                                {t('system.sessions.actions.revoke')}
                            </Button>
                        ) : null}
                    </li>
                );
            })}
        </ul>
    );
}
