import { CopyButton } from '@/components/shared/copy-button';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

function isEmpty(value: unknown): boolean {
    if (value === null || value === undefined) {
        return true;
    }
    if (Array.isArray(value)) {
        return value.length === 0;
    }
    return typeof value === 'object' && Object.keys(value).length === 0;
}

/**
 * Read-only, LTR, pretty-printed JSON (sanitised provider payloads/headers) with a copy button.
 * Content is rendered as text, never as HTML.
 */
export function JsonBlock({
    value,
    label,
    className,
}: {
    value: unknown;
    label: string;
    className?: string;
}) {
    if (isEmpty(value)) {
        return (
            <p className="text-sm text-muted-foreground">
                {t('integrations.webhooks.empty_json')}
            </p>
        );
    }
    const json = JSON.stringify(value, null, 2);

    return (
        <div className={cn('relative', className)}>
            <CopyButton
                value={json}
                label={t('integrations.actions.copy_json', { label })}
                className="absolute end-1 top-1 z-10 bg-background/80 backdrop-blur"
            />
            <pre
                dir="ltr"
                tabIndex={0}
                aria-label={label}
                className="max-h-96 scrollbar-thin overflow-auto rounded-lg border bg-muted/50 p-3 pe-12 text-start font-mono text-xs leading-relaxed break-normal whitespace-pre focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
            >
                {json}
            </pre>
        </div>
    );
}
