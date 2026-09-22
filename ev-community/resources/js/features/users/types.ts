import type { LocalizedLabel, SecurityEventRow, SessionRow } from '@/features/system/types';

export type RoleOption = {
    slug: string;
    name_ar: string;
    name_en: string;
    is_super: boolean;
    is_system?: boolean;
    portal: 'admin' | 'partner' | 'member' | string;
    /** Whether the current actor may grant this role (UI hint; enforced on the server). */
    grantable?: boolean;
};

export type PermissionOption = { key: string; label: LocalizedLabel; grantable?: boolean };

export type PermissionGroup = { module: string; label: LocalizedLabel; permissions: PermissionOption[] };

export type StaffUserSummary = {
    id: string;
    name: string;
    email: string;
    mobile: string | null;
    status: 'active' | 'disabled' | string;
    preferred_locale: string;
    roles: string[];
    is_super: boolean;
    mfa_enabled: boolean;
    last_login_at: string | null;
    created_at: string | null;
    disabled_at: string | null;
};

export type StaffUserDetail = StaffUserSummary & {
    email_verified_at: string | null;
    last_login_ip: string | null;
    password_changed_at: string | null;
    disabled_by: string | null;
    is_staff_account: boolean;
    is_member: boolean;
    direct_permissions: string[];
    role_permissions: string[];
    effective_permissions: string[];
};

export type UserFormProps = {
    roles: RoleOption[];
    permissionGroups: PermissionGroup[];
    actorIsSuper: boolean;
    locales: string[];
};

export type { SecurityEventRow, SessionRow };
