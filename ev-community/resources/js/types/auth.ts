export type MembershipSummary = {
    id: string;
    member_number: string;
    status: 'pending' | 'active' | 'suspended' | 'rejected' | 'expired';
};

export type User = {
    id: string;
    name: string;
    email: string;
    mobile: string | null;
    avatar?: string;
    preferred_locale: 'ar' | 'en';
    email_verified_at: string | null;
    two_factor_enabled?: boolean;
    is_staff: boolean;
    is_partner: boolean;
    is_member: boolean;
    membership: MembershipSummary | null;
    [key: string]: unknown;
};

export type Auth = {
    user: User | null;
    roles: string[];
    permissions: string[];
};

export type Passkey = {
    id: number;
    name: string;
    authenticator: string | null;
    created_at_diff: string;
    last_used_at_diff: string | null;
};

export type TwoFactorSetupData = {
    svg: string;
    url: string;
};

export type TwoFactorSecretKey = {
    secretKey: string;
};
