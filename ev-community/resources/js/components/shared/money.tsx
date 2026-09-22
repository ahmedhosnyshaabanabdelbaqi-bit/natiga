import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

export function Money({ amount, currency, className, muted = false }: { amount: string | number | null | undefined; currency?: string; className?: string; muted?: boolean }) {
    return (
        <span dir="ltr" className={cn('tabular whitespace-nowrap', muted && 'text-muted-foreground', className)}>
            {formatMoney(amount, currency)}
        </span>
    );
}
