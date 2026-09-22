import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { StatusTone } from '@/components/shared/status-badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type {
    HealthStatus,
    IntegrationEventRow,
    WebhookStatus,
} from '@/features/integrations/types';

const healthTone: Record<HealthStatus, StatusTone> = {
    operational: 'success',
    degraded: 'warning',
    unavailable: 'danger',
    not_configured: 'muted',
    unknown: 'info',
};

export function HealthBadge({
    status,
    className,
}: {
    status: HealthStatus;
    className?: string;
}) {
    return (
        <StatusBadge
            status={status}
            tone={healthTone[status]}
            label={t(`integrations.health.${status}`)}
            className={cn('normal-case', className)}
        />
    );
}

const webhookTone: Record<WebhookStatus, StatusTone> = {
    received: 'info',
    processing: 'warning',
    processed: 'success',
    failed: 'danger',
    ignored: 'muted',
};

export function WebhookStatusBadge({
    status,
    className,
}: {
    status: WebhookStatus;
    className?: string;
}) {
    return (
        <StatusBadge
            status={status}
            tone={webhookTone[status]}
            label={t(`integrations.webhooks.status.${status}`)}
            className={cn('normal-case', className)}
        />
    );
}

const eventTone: Record<IntegrationEventRow['status'], StatusTone> = {
    success: 'success',
    failed: 'danger',
    timeout: 'warning',
};

export function EventStatusBadge({
    status,
}: {
    status: IntegrationEventRow['status'];
}) {
    return (
        <StatusBadge
            status={status}
            tone={eventTone[status]}
            label={t(`integrations.events.status.${status}`)}
            className="normal-case"
        />
    );
}

/** Signature verification result of a webhook event (null = not checked). */
export function SignatureBadge({ valid }: { valid: boolean | null }) {
    if (valid === null) {
        return <span className="text-muted-foreground">—</span>;
    }
    const Icon = valid ? ShieldCheck : ShieldAlert;
    return (
        <Badge
            variant="outline"
            className={cn(
                'gap-1 border-transparent font-normal',
                valid
                    ? 'bg-success-soft text-success dark:bg-success/80 dark:text-success-foreground'
                    : 'bg-danger-soft text-danger dark:bg-danger/80 dark:text-danger-foreground',
            )}
        >
            <Icon className="size-3.5" aria-hidden="true" />
            {valid
                ? t('integrations.webhooks.signature_valid')
                : t('integrations.webhooks.signature_invalid')}
        </Badge>
    );
}

/** "Configured" / "Not configured" chip used in the matrix and the tools. */
export function ConfiguredBadge({ configured }: { configured: boolean }) {
    return (
        <StatusBadge
            status={configured ? 'configured' : 'not_configured'}
            tone={configured ? 'success' : 'muted'}
            label={
                configured
                    ? t('integrations.matrix.configured_yes')
                    : t('integrations.matrix.configured_no')
            }
            className="normal-case"
        />
    );
}
