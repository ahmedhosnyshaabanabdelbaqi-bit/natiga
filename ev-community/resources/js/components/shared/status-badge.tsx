import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'brand' | 'default';

const toneClasses: Record<StatusTone, string> = {
    success: 'border-transparent bg-success-soft text-success dark:text-success-foreground dark:bg-success/80',
    warning: 'border-transparent bg-warning-soft text-warning dark:text-warning-foreground dark:bg-warning/80',
    danger: 'border-transparent bg-danger-soft text-danger dark:text-danger-foreground dark:bg-danger/80',
    info: 'border-transparent bg-info-soft text-info dark:text-info-foreground dark:bg-info/80',
    muted: 'border-transparent bg-muted text-muted-foreground',
    brand: 'border-transparent bg-brand-soft text-brand dark:text-brand-foreground dark:bg-brand',
    default: '',
};

/** Generic mapping for common status vocabularies; modules can pass an explicit tone. */
export function toneForStatus(status: string): StatusTone {
    const s = status.toLowerCase();
    if (['active', 'approved', 'completed', 'delivered', 'paid', 'confirmed', 'verified', 'received', 'published', 'resolved', 'operational', 'ready', 'in_stock', 'working'].includes(s)) return 'success';
    if (['pending', 'pending_review', 'awaiting_payment', 'awaiting_compatibility', 'processing', 'draft', 'requested', 'under_review', 'review', 'partially_delivered', 'partially_received', 'in_transit', 'transit', 'waiting', 'needs_verification', 'degraded', 'busy', 'partially_working', 'likely', 'collecting', 'open'].includes(s)) return 'warning';
    if (['rejected', 'cancelled', 'suspended', 'failed', 'reversed', 'disabled', 'expired', 'no_show', 'out_of_service', 'unavailable', 'not_compatible', 'infected', 'escalated', 'out_of_stock', 'discontinued', 'closed_lost'].includes(s)) return 'danger';
    if (['unknown', 'not_configured', 'inactive', 'archived', 'closed', 'not_scanned'].includes(s)) return 'muted';
    return 'info';
}

export function StatusBadge({ status, label, tone, className }: { status: string; label?: string; tone?: StatusTone; className?: string }) {
    const resolved = tone ?? toneForStatus(status);
    return (
        <Badge variant="outline" className={cn('capitalize', toneClasses[resolved], className)} data-status={status}>
            {label ?? status.replace(/_/g, ' ')}
        </Badge>
    );
}
