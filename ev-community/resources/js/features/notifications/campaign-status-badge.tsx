import { StatusBadge } from '@/components/shared/status-badge';
import type { StatusTone } from '@/components/shared/status-badge';
import type { CampaignStatus } from '@/features/notifications/types';

const tones: Record<CampaignStatus, StatusTone> = {
    draft: 'muted',
    scheduled: 'info',
    sending: 'warning',
    sent: 'success',
    cancelled: 'muted',
    failed: 'danger',
};

export function CampaignStatusBadge({ status, label }: { status: CampaignStatus; label: string }) {
    return <StatusBadge status={status} label={label} tone={tones[status]} />;
}
