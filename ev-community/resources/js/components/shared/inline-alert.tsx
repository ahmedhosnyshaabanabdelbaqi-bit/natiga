import type { LucideIcon } from 'lucide-react';
import {
    AlertTriangle,
    CheckCircle2,
    Info,
    OctagonAlert,
    X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type InlineAlertTone = 'info' | 'warning' | 'danger' | 'success';

type Props = {
    tone?: InlineAlertTone;
    title?: ReactNode;
    children?: ReactNode;
    icon?: LucideIcon | null;
    /** Buttons/links rendered under the message. */
    action?: ReactNode;
    onDismiss?: () => void;
    className?: string;
};

const styles: Record<InlineAlertTone, { box: string; icon: LucideIcon }> = {
    info: {
        box: 'border-info/30 bg-info-soft/60 text-info dark:text-info-foreground dark:bg-info/70',
        icon: Info,
    },
    warning: {
        box: 'border-warning/30 bg-warning-soft/60 text-warning dark:text-warning-foreground dark:bg-warning/70',
        icon: AlertTriangle,
    },
    danger: {
        box: 'border-danger/30 bg-danger-soft/60 text-danger dark:text-danger-foreground dark:bg-danger/70',
        icon: OctagonAlert,
    },
    success: {
        box: 'border-success/30 bg-success-soft/60 text-success dark:text-success-foreground dark:bg-success/70',
        icon: CheckCircle2,
    },
};

/** Contextual message box (not a toast): notices inside forms, cards and pages. */
export function InlineAlert({
    tone = 'info',
    title,
    children,
    icon,
    action,
    onDismiss,
    className,
}: Props) {
    const Icon = icon === null ? null : (icon ?? styles[tone].icon);
    return (
        <div
            role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
            className={cn(
                'flex gap-3 rounded-lg border px-4 py-3 text-sm',
                styles[tone].box,
                className,
            )}
        >
            {Icon ? (
                <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ) : null}
            <div className="min-w-0 flex-1 space-y-1">
                {title ? <p className="font-medium">{title}</p> : null}
                {children ? (
                    <div className="text-sm opacity-90 [&_a]:underline [&_a]:underline-offset-4">
                        {children}
                    </div>
                ) : null}
                {action ? <div className="pt-1">{action}</div> : null}
            </div>
            {onDismiss ? (
                <button
                    type="button"
                    onClick={onDismiss}
                    className="-me-1 rounded-md p-1 opacity-70 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60"
                    aria-label={t('ui.alert.dismiss')}
                >
                    <X className="size-4" aria-hidden="true" />
                </button>
            ) : null}
        </div>
    );
}
