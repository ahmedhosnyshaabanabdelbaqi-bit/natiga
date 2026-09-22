import { formatDate, formatDateTime, formatRelative } from '@/lib/format';

export function DateTime({ value, mode = 'datetime', className }: { value: string | null | undefined; mode?: 'date' | 'datetime' | 'relative'; className?: string }) {
    if (!value) {
        return <span className={className}>—</span>;
    }
    const text = mode === 'date' ? formatDate(value) : mode === 'relative' ? formatRelative(value) : formatDateTime(value);
    return (
        <time dateTime={value} title={formatDateTime(value)} className={className}>
            {text}
        </time>
    );
}
