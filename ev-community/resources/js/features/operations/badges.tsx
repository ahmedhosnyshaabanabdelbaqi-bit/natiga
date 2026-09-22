import type { StatusTone } from '@/components/shared/status-badge';
import { StatusBadge } from '@/components/shared/status-badge';
import type {
    ExceptionStatus,
    IncidentStatus,
    Severity,
} from '@/features/operations/types';
import { t } from '@/lib/i18n';

export const SEVERITY_TONE: Record<Severity, StatusTone> = {
    p0: 'danger',
    p1: 'warning',
    p2: 'info',
    p3: 'muted',
};

const EXCEPTION_TONE: Record<ExceptionStatus, StatusTone> = {
    open: 'danger',
    assigned: 'warning',
    resolved: 'success',
    ignored: 'muted',
};

const INCIDENT_TONE: Record<IncidentStatus, StatusTone> = {
    open: 'danger',
    investigating: 'warning',
    mitigated: 'info',
    resolved: 'success',
    closed: 'muted',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
    return (
        <StatusBadge
            status={severity}
            tone={SEVERITY_TONE[severity] ?? 'info'}
            label={t(`operations.severity.${severity}`)}
            className="normal-case"
        />
    );
}

export function ExceptionStatusBadge({ status }: { status: ExceptionStatus }) {
    return (
        <StatusBadge
            status={status}
            tone={EXCEPTION_TONE[status] ?? 'info'}
            label={t(`operations.exception_status.${status}`)}
        />
    );
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
    return (
        <StatusBadge
            status={status}
            tone={INCIDENT_TONE[status] ?? 'info'}
            label={t(`operations.incident_status.${status}`)}
        />
    );
}
