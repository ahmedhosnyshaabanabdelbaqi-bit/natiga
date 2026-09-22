import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useClipboard } from '@/hooks/use-clipboard';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = {
    /** Text written to the clipboard. */
    value: string;
    /** Accessible name / tooltip; defaults to core.actions.copy. */
    label?: string;
    /** Render the label next to the icon (default: icon only). */
    showLabel?: boolean;
    size?: 'icon' | 'sm' | 'default';
    variant?: 'ghost' | 'outline' | 'secondary';
    className?: string;
};

/** Copies `value` to the clipboard and confirms with a check icon for two seconds. */
export function CopyButton({ value, label, showLabel = false, size = 'icon', variant = 'ghost', className }: Props) {
    const [, copy] = useClipboard();
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) {
            return;
        }
        const timer = window.setTimeout(() => setCopied(false), 2000);
        return () => window.clearTimeout(timer);
    }, [copied]);

    const name = label ?? t('core.actions.copy');
    const Icon = copied ? Check : Copy;

    return (
        <Button
            type="button"
            size={showLabel && size === 'icon' ? 'sm' : size}
            variant={variant}
            className={cn(copied && 'text-success', className)}
            aria-label={showLabel ? undefined : name}
            title={name}
            onClick={async () => {
                const ok = await copy(value);
                setCopied(ok);
            }}
        >
            <Icon className="size-4" aria-hidden="true" />
            {showLabel ? <span>{copied ? t('core.actions.copied') : name}</span> : null}
            <span className="sr-only" aria-live="polite">
                {copied ? t('core.actions.copied') : ''}
            </span>
        </Button>
    );
}
