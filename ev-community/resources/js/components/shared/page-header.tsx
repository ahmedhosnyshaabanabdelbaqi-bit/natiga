import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({
    title,
    description,
    actions,
    className,
    children,
}: {
    title: string;
    description?: string | null;
    actions?: ReactNode;
    className?: string;
    children?: ReactNode;
}) {
    return (
        <div
            className={cn(
                'flex flex-col gap-3 md:flex-row md:items-start md:justify-between',
                className,
            )}
        >
            <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-balance md:text-2xl">
                    {title}
                </h1>
                {description ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                        {description}
                    </p>
                ) : null}
                {children}
            </div>
            {actions ? (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {actions}
                </div>
            ) : null}
        </div>
    );
}
