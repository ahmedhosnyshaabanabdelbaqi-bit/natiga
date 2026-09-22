import type { Paginated } from '@/types/pagination';

export type MembershipStatus = 'pending' | 'active' | 'suspended' | 'rejected' | 'expired';
export type ReferralStatus = 'invited' | 'registered' | 'approved';
export type DeletionRequestStatus = 'requested' | 'under_review' | 'completed' | 'rejected';
export type VerificationResult = 'valid' | 'invalid' | 'expired' | 'not_active';

export type Option = { value: string; label: string };
export type GovernorateOption = { id: number; name: string };

export type StatusCounts = Record<MembershipStatus | 'total', number>;

export type MemberRow = {
    id: string;
    member_number: string;
    name: string;
    email: string;
    mobile: string | null;
    status: MembershipStatus;
    governorate: string | null;
    joined_at: string | null;
    referral_source: string | null;
    user_status: 'active' | 'disabled';
};

export type MemberListFilters = Partial<{
    search: string;
    status: MembershipStatus;
    governorate_id: number | string;
    joined_from: string;
    joined_to: string;
    referral_source: string;
    sort: string;
    direction: 'asc' | 'desc';
    per_page: number | string;
}>;

export type MemberListProps = {
    members: Paginated<MemberRow>;
    filters: MemberListFilters;
    counts: StatusCounts;
    governorates: GovernorateOption[];
    referral_sources: string[];
    statuses: Option[];
};

export type MembershipDetail = {
    id: string;
    member_number: string;
    status: MembershipStatus;
    status_label: string;
    allowed_transitions: MembershipStatus[];
    joined_at: string | null;
    approved_at: string | null;
    approved_by: string | null;
    suspended_at: string | null;
    expires_at: string | null;
    referral_code: string;
    referral_source: string | null;
    referred_by: { id: string; member_number: string; name: string | null } | null;
    qr_rotated_at: string | null;
    created_at: string | null;
    user: {
        id: string;
        name: string;
        email: string;
        mobile: string | null;
        preferred_locale: 'ar' | 'en';
        governorate_id: number | null;
        governorate: string | null;
        status: 'active' | 'disabled';
        last_login_at: string | null;
        email_verified_at: string | null;
        mfa_enabled: boolean;
        created_at: string | null;
    };
};

export type StatusHistoryEntry = {
    id: number;
    from: MembershipStatus | null;
    to: MembershipStatus;
    reason: string | null;
    changed_by: string | null;
    created_at: string | null;
};

export type VerificationEntry = {
    id: number;
    purpose: string;
    result: VerificationResult;
    verified_by: string | null;
    ip_address: string | null;
    context: string | null;
    created_at: string | null;
};

export type MemberNote = {
    id: number;
    body: string;
    is_pinned: boolean;
    author: string | null;
    created_at: string | null;
};

export type ConsentEntry = {
    id: number;
    type: string;
    label: string;
    version: string | null;
    granted: boolean;
    accepted_at: string | null;
    withdrawn_at: string | null;
    source: string;
    created_at: string | null;
};

export type MarketingConsents = Record<'marketing_email' | 'marketing_sms' | 'marketing_whatsapp', boolean>;

export type SecurityEventEntry = {
    id: number;
    event_type: string;
    severity: 'info' | 'warning' | 'critical';
    ip_address: string | null;
    created_at: string | null;
};

export type DeletionRequestSummary = {
    id: string;
    status: DeletionRequestStatus;
    reason: string | null;
    requested_at: string | null;
    processed_at: string | null;
    processed_by: string | null;
    notes: string | null;
};

export type ReferralStats = { invited: number; registered: number; approved: number };

export type AdminReferredMember = {
    id: string;
    member_number: string;
    name: string | null;
    status: ReferralStatus;
    membership_status: MembershipStatus;
    created_at: string | null;
};

/** Outcome of POST /admin/members/verify and /partner/members/verify (`data`). */
export type VerifyOutcome = {
    valid: boolean;
    reason: Exclude<VerificationResult, 'valid'> | null;
    member: {
        id?: string;
        name: string;
        member_number: string;
        status: MembershipStatus;
        joined_at?: string | null;
        expires_at?: string | null;
        governorate?: string | null;
        url?: string | null;
    } | null;
};

export type VerifyResponse = {
    data: VerifyOutcome;
    message: string;
    errors: Record<string, string[]>;
    meta: { request_id: string | null };
};
