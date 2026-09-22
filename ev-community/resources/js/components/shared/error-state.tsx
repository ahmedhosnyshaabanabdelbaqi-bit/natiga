import { AlertTriangle, ShieldOff, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

export function ErrorState({ kind = 'error', title, description, onRetry, action }: { kind?: 'error' | 'permission' | 'connection'; title?: string; description?: string | null; onRetry?: () => void; action?: ReactNode }) {
    const Icon = kind === 'permission' ? ShieldOff : kind === 'connection' ? WifiOff : AlertTriangle;
    const defaultTitle = kind === 'permission' ? t('core.states.permission_denied') : kind === 'connection' ? t('core.states.connection_error') : t('core.states.error');
    return (
        <div role="alert" className="flex flex-col items-center justify-center rounded-xl border border-danger/30 bg-danger-soft/40 px-6 py-10 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
                <Icon className="size-6" />
            </div>
            <h3 className="text-base font-medium">{title ?? defaultTitle}</h3>
            {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
            <div className="mt-4 flex gap-2">
                {onRetry ? <Button variant="outline" onClick={onRetry}>{t('core.actions.retry')}</Button> : null}
                {action}
            </div>
        </div>
    );
}
