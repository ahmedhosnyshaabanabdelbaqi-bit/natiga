import type { ReactNode } from 'react';
import { DateTime } from '@/components/shared/date-time';
import { Money } from '@/components/shared/money';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Code } from '@/components/ui/code';
import { cn } from '@/lib/utils';

type SectionCardProps = {
    title?: ReactNode;
    description?: ReactNode;
    /** Buttons rendered at the inline-end of the header. */
    actions?: ReactNode;
    footer?: ReactNode;
    children?: ReactNode;
    /** Remove the content padding (for tables/lists that fill the card). */
    flush?: boolean;
    className?: string;
    contentClassName?: string;
};

/** Card with a title/description header, optional actions and footer. */
export function SectionCard({
    title,
    description,
    actions,
    footer,
    children,
    flush = false,
    className,
    contentClassName,
}: SectionCardProps) {
    const hasHeader = Boolean(title || description || actions);
    return (
        <Card className={cn('gap-0 py-0 shadow-card', className)}>
            {hasHeader ? (
                <CardHeader className="flex flex-row items-start justify-between gap-3 border-b px-4 py-4 md:px-6">
                    <div className="min-w-0 space-y-1">
                        {title ? (
                            <CardTitle className="text-base">{title}</CardTitle>
                        ) : null}
                        {description ? (
                            <CardDescription>{description}</CardDescription>
                        ) : null}
                    </div>
                    {actions ? (
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                            {actions}
                        </div>
                    ) : null}
                </CardHeader>
            ) : null}
            {children !== undefined && children !== null ? (
                <CardContent
                    className={cn(
                        flush ? 'p-0' : 'px-4 py-4 md:px-6',
                        contentClassName,
                    )}
                >
                    {children}
                </CardContent>
            ) : null}
            {footer ? (
                <CardFooter className="border-t px-4 py-3 md:px-6">
                    {footer}
                </CardFooter>
            ) : null}
        </Card>
    );
}

export type DescriptionItem = {
    label: ReactNode;
    value: ReactNode;
    /** How to render primitive values. `text` (default), `code` (LTR technical id), `money`, `date`, `datetime`, `relative`. */
    type?: 'text' | 'code' | 'money' | 'date' | 'datetime' | 'relative';
    /** Currency code for `money` values (defaults to the platform base currency). */
    currency?: string;
    /** Span both columns. */
    full?: boolean;
    /** Skip the item entirely (handy for conditional rows). */
    hidden?: boolean;
};

function renderValue(item: DescriptionItem): ReactNode {
    const { value, type = 'text' } = item;
    if (value === null || value === undefined || value === '') {
        return <span className="text-muted-foreground">—</span>;
    }
    if (
        type === 'code' &&
        (typeof value === 'string' || typeof value === 'number')
    ) {
        return <Code>{value}</Code>;
    }
    if (
        type === 'money' &&
        (typeof value === 'string' || typeof value === 'number')
    ) {
        return <Money amount={value} currency={item.currency} />;
    }
    if (
        (type === 'date' || type === 'datetime' || type === 'relative') &&
        typeof value === 'string'
    ) {
        return <DateTime value={value} mode={type} />;
    }
    return value;
}

type DescriptionListProps = {
    items: DescriptionItem[];
    /** Columns on ≥sm screens (1 or 2). */
    columns?: 1 | 2;
    /** `stacked` (label above value, default) or `inline` (label beside value). */
    layout?: 'stacked' | 'inline';
    className?: string;
};

/** Label/value grid for detail pages. Handles nulls, money, dates and technical codes. */
export function DescriptionList({
    items,
    columns = 2,
    layout = 'stacked',
    className,
}: DescriptionListProps) {
    const visible = items.filter((item) => !item.hidden);
    return (
        <dl
            className={cn(
                'grid gap-x-6 gap-y-4',
                columns === 2 && 'sm:grid-cols-2',
                layout === 'inline' && 'gap-y-2',
                className,
            )}
        >
            {visible.map((item, index) => (
                <div
                    key={index}
                    className={cn(
                        'min-w-0',
                        item.full && 'sm:col-span-2',
                        layout === 'inline' &&
                            'flex items-baseline justify-between gap-4 border-b border-dashed py-1.5 last:border-0',
                    )}
                >
                    <dt
                        className={cn(
                            'text-xs font-medium text-muted-foreground',
                            layout === 'inline' && 'shrink-0 text-sm',
                        )}
                    >
                        {item.label}
                    </dt>
                    <dd
                        className={cn(
                            'mt-0.5 text-sm break-words',
                            layout === 'inline' && 'mt-0 text-end',
                        )}
                    >
                        {renderValue(item)}
                    </dd>
                </div>
            ))}
        </dl>
    );
}
