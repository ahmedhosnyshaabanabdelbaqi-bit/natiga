/** Bilingual label as stored in module Permissions.php / Settings.php definitions. */
export type LocalizedLabel = { ar: string; en: string };

export type SettingValue = string | number | boolean | null | SettingJson;
export type SettingJson = { [key: string]: SettingValue } | SettingValue[];

export type SettingType = 'string' | 'text' | 'int' | 'decimal' | 'bool' | 'json' | 'image' | 'select';
export type SettingInput = SettingType | 'color' | 'secret';

export type SettingItem = {
    key: string;
    label: LocalizedLabel;
    type: SettingType;
    input: SettingInput;
    options: string[] | null;
    option_labels: Record<string, LocalizedLabel> | null;
    help: LocalizedLabel | string | null;
    rules: string;
    sensitive: boolean;
    public: boolean;
    module: string;
    value: SettingValue;
    default: SettingValue;
    overridden: boolean;
};

export type SettingGroup = { key: string; items: SettingItem[] };

export type ModuleItem = {
    key: string;
    name: LocalizedLabel;
    core: boolean;
    experimental: boolean;
    enabled: boolean;
};

export type BannerLevel = 'information' | 'warning' | 'major';
export type BannerTarget = 'public' | 'member' | 'partner';

export type Banner = {
    id: number;
    level: BannerLevel;
    message_ar: string;
    message_en: string;
    targets: BannerTarget[];
    is_active: boolean;
    starts_at: string | null;
    ends_at: string | null;
    created_at: string | null;
};

export type FailedJob = {
    id: number;
    uuid: string;
    connection: string;
    queue: string;
    job: string;
    attempts: number | null;
    max_tries: number | null;
    failed_at: string | null;
    exception: string;
};

export type QueueHealth = {
    connection: string;
    pending: { queue: string; count: number }[];
    reserved: number;
    failed: number;
    heartbeat: { at: string | null; age_seconds: number | null; stale: boolean };
};

export type SetupItem = { key: string; ok: boolean; href: string | null; detail: string | null };

export type SessionRow = {
    /** Opaque session key (never the raw session id). */
    id: string;
    ip_address: string | null;
    user_agent: string | null;
    device: string;
    last_activity: string;
    is_current: boolean;
};

export type SecurityEventRow = {
    id: number;
    type: string;
    severity: 'info' | 'warning' | 'critical' | string;
    ip_address: string | null;
    user_agent: string | null;
    meta: Record<string, unknown> | null;
    created_at: string | null;
};
