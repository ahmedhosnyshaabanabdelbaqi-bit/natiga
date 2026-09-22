import * as React from 'react';
import { cn } from '@/lib/utils';

/** Technical identifiers (SKU, VIN, OEM, part/tracking numbers). Always LTR, tabular, copyable. */
export function Code({ className, children, ...props }: React.ComponentProps<'span'>) {
    return (
        <span dir="ltr" className={cn('code inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground select-all', className)} {...props}>
            {children}
        </span>
    );
}
