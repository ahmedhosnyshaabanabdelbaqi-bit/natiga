import type { LucideIcon } from 'lucide-react';
import { Link } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function StatCard({ label, value, hint, icon: Icon, href, tone = 'default', className }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; href?: string; tone?: 'default' | 'brand' | 'success' | 'warning' | 'danger'; className?: string }) {
    const toneClass = { default: 'text-muted-foreground', brand: 'text-brand', success: 'text-success', warning: 'text-warning', danger: 'text-danger' }[tone];
    const body = (
        <CardContent className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
                <p className="truncate text-xs font-medium text-muted-foreground uppercase">{label}</p>
                <p className="mt-1 text-2xl font-semibold tabular">{value}</p>
                {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
            </div>
            {Icon ? <Icon className={cn('size-5 shrink-0', toneClass)} aria-hidden="true" /> : null}
        </CardContent>
    );
    return (
        <Card className={cn('shadow-card transition hover:shadow-elevated', className)}>
            {href ? <Link href={href} className="block" prefetch>{body}</Link> : body}
        </Card>
    );
}
