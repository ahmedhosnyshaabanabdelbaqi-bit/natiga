import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

function Busy({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div aria-busy="true" aria-live="polite" className={className}>
            <span className="sr-only">{t('core.states.loading')}</span>
            {children}
        </div>
    );
}

/** Placeholder for a data table (header + `rows` rows of `columns` cells). */
export function SkeletonTable({
    rows = 5,
    columns = 4,
    className,
}: {
    rows?: number;
    columns?: number;
    className?: string;
}) {
    return (
        <Busy
            className={cn(
                'overflow-hidden rounded-xl border bg-card',
                className,
            )}
        >
            <div className="flex gap-4 border-b bg-muted/40 px-4 py-3">
                {Array.from({ length: columns }, (_, index) => (
                    <Skeleton key={index} className="h-4 flex-1" />
                ))}
            </div>
            {Array.from({ length: rows }, (_, row) => (
                <div
                    key={row}
                    className="flex gap-4 border-b px-4 py-3.5 last:border-0"
                >
                    {Array.from({ length: columns }, (_, column) => (
                        <Skeleton
                            key={column}
                            className={cn(
                                'h-4 flex-1',
                                column === 0 && 'max-w-40',
                            )}
                        />
                    ))}
                </div>
            ))}
        </Busy>
    );
}

/** Placeholder for a card grid / list (KPIs, products, bookings). */
export function SkeletonCards({
    count = 3,
    className,
}: {
    count?: number;
    className?: string;
}) {
    return (
        <Busy
            className={cn(
                'grid gap-3 sm:grid-cols-2 lg:grid-cols-3',
                className,
            )}
        >
            {Array.from({ length: count }, (_, index) => (
                <div
                    key={index}
                    className="space-y-3 rounded-xl border bg-card p-4"
                >
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-5/6" />
                    <Skeleton className="h-8 w-24" />
                </div>
            ))}
        </Busy>
    );
}

/** Placeholder for a form (label + input pairs and an actions row). */
export function SkeletonForm({
    fields = 4,
    className,
}: {
    fields?: number;
    className?: string;
}) {
    return (
        <Busy className={cn('space-y-6', className)}>
            {Array.from({ length: fields }, (_, index) => (
                <div key={index} className="space-y-2">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-9 w-full" />
                </div>
            ))}
            <div className="flex justify-end gap-2">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-24" />
            </div>
        </Busy>
    );
}
