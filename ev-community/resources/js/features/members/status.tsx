import type { StatusTone } from '@/components/shared/status-badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { t } from '@/lib/i18n';
import type { DeletionRequestStatus, MembershipStatus, ReferralStatus, VerificationResult } from './types';

export const MEMBERSHIP_STATUSES: MembershipStatus[] = ['pending', 'active', 'suspended', 'rejected', 'expired'];

const membershipTones: Record<MembershipStatus, StatusTone> = {
    active: 'success',
    pending: 'warning',
    suspended: 'danger',
    rejected: 'danger',
    expired: 'muted',
};

const verificationTones: Record<VerificationResult, StatusTone> = {
    valid: 'success',
    invalid: 'danger',
    expired: 'warning',
    not_active: 'danger',
};

export function membershipTone(status: MembershipStatus): StatusTone {
    return membershipTones[status];
}

export function MembershipStatusBadge({ status, className }: { status: MembershipStatus; className?: string }) {
    return <StatusBadge status={status} tone={membershipTones[status]} label={t(`members.status.${status}`)} className={className} />;
}

export function ReferralStatusBadge({ status }: { status: ReferralStatus }) {
    return <StatusBadge status={status} tone={status === 'approved' ? 'success' : status === 'registered' ? 'info' : 'muted'} label={t(`referrals.status.${status}`)} />;
}

export function DeletionStatusBadge({ status }: { status: DeletionRequestStatus }) {
    const tone: StatusTone = status === 'completed' ? 'success' : status === 'rejected' ? 'muted' : 'warning';
    return <StatusBadge status={status} tone={tone} label={t(`privacy.deletion.status.${status}`)} />;
}

export function VerificationResultBadge({ result }: { result: VerificationResult }) {
    return <StatusBadge status={result} tone={verificationTones[result]} label={t(`members.verification.result.${result}`)} />;
}
