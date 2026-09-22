import { humanize } from '@/features/system/i18n';
import { cn } from '@/lib/utils';

function display(value: unknown): string {
    if (value === null || value === undefined || value === '') {
        return '—';
    }
    if (Array.isArray(value)) {
        return value
            .map((item) =>
                typeof item === 'string' || typeof item === 'number'
                    ? String(item)
                    : JSON.stringify(item),
            )
            .join(', ');
    }
    if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    ) {
        return String(value);
    }
    return JSON.stringify(value);
}

/** Compact key/value rendering of a security event's / exception's technical metadata (LTR values). */
export function MetaSummary({
    meta,
    className,
    limit,
}: {
    meta: Record<string, unknown> | null | undefined;
    className?: string;
    limit?: number;
}) {
    const entries = Object.entries(meta ?? {});
    if (entries.length === 0) {
        return <span className="text-muted-foreground">—</span>;
    }
    const shown = limit ? entries.slice(0, limit) : entries;
    return (
        <dl
            className={cn(
                'grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs',
                className,
            )}
        >
            {shown.map(([key, value]) => (
                <div key={key} className="contents">
                    <dt className="text-muted-foreground">{humanize(key)}</dt>
                    <dd className="font-mono break-all" dir="ltr">
                        {display(value)}
                    </dd>
                </div>
            ))}
            {limit && entries.length > limit ? (
                <dd className="col-span-2 text-muted-foreground">…</dd>
            ) : null}
        </dl>
    );
}
