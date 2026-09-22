import { Inbox } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: { icon?: ComponentType<{ className?: string }>; title?: string; description?: string | null; action?: ReactNode; className?: string }) {
    return (
        <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center', className)}>
            <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon className="size-6" aria-hidden="true" />
            </div>
            <h3 className="text-base font-medium">{title ?? t('core.states.empty')}</h3>
            {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
            {action ? <div className="mt-4">{action}</div> : null}
        </div>
    );
}

export function NoResults({ onReset }: { onReset?: () => void }) {
    return (
        <EmptyState
            title={t('core.states.no_results')}
            description={t('core.states.try_adjust_filters')}
            action={onReset ? <button type="button" onClick={onReset} className="rounded-sm text-sm font-medium text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60">{t('core.actions.reset')}</button> : undefined}
        />
    );
}
