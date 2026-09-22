import type { Paginated } from '@/types/pagination';

export type Option = { value: string; label: string };

export type NotificationItem = {
    id: string;
    category: string;
    category_label: string;
    key: string;
    title: string;
    body: string;
    url: string | null;
    is_read: boolean;
    read_at: string | null;
    created_at: string | null;
};

/** Props every notification-center page receives from NotificationCenterController::index(). */
export type NotificationCenterProps = {
    notifications: Paginated<NotificationItem>;
    filters: { category: string | null; unread: boolean };
    categories: Option[];
    unreadCount: number;
    preferencesUrl: string | null;
};

/** Portal-specific endpoints (Wayfinder helpers) handed to the shared center. */
export type NotificationCenterEndpoints = {
    index: string;
    readAll: string;
    read: (id: string) => string;
    unreadCount: string;
};

export type ChannelValue = 'in_app' | 'email' | 'sms' | 'whatsapp';

export type ChannelOption = {
    value: ChannelValue;
    label: string;
    configured: boolean;
    always: boolean;
};

export type PreferenceChannel = {
    value: ChannelValue;
    label: string;
    configured: boolean;
    messaging: boolean;
    consent: boolean;
};

export type PreferenceCell = { enabled: boolean; locked: boolean };

export type PreferenceCategory = {
    category: string;
    label: string;
    transactional: boolean;
    channels: Record<ChannelValue, PreferenceCell>;
};

export type PreferencesMatrix = {
    channels: PreferenceChannel[];
    categories: PreferenceCategory[];
};

export type AudienceField = {
    name: string;
    /** select | number | text | textarea (modules may register other plain-text types). */
    type: string;
    label: string;
    hint: string | null;
    options: { value: number | string; label: string }[] | null;
};

export type AudienceOption = {
    key: string;
    label: string;
    module: string | null;
    fields: AudienceField[];
};

export type CampaignStatus =
    | 'draft'
    | 'scheduled'
    | 'sending'
    | 'sent'
    | 'cancelled'
    | 'failed';

export type Campaign = {
    id: string;
    title: string;
    title_ar: string;
    title_en: string;
    body_ar: string;
    body_en: string;
    url: string | null;
    category: string;
    category_label: string;
    audience_type: string;
    audience_label: string;
    audience_summary: string;
    audience_params?: Record<string, unknown>;
    channels: ChannelValue[];
    channel_labels: string[];
    is_marketing: boolean;
    status: CampaignStatus;
    status_label: string;
    status_tone: 'success' | 'warning' | 'danger' | 'muted';
    scheduled_at: string | null;
    started_at: string | null;
    finished_at: string | null;
    recipients_count: number;
    sent_count: number;
    failed_count: number;
    skipped_count: number;
    last_error: string | null;
    created_by: string | null;
    created_at: string | null;
    updated_at: string | null;
    can: {
        edit: boolean;
        send: boolean;
        retry: boolean;
        schedule: boolean;
        cancel: boolean;
        delete: boolean;
    };
};

export type LocalePreview = {
    title: string;
    body: string;
    email_subject: string;
    email_html: string;
};

export type TemplateRow = {
    key: string;
    module: string;
    module_label: string;
    subject: string;
    customized: boolean;
    updated_at: string | null;
    updated_by: string | null;
};

export type TemplateFields = {
    subject_ar: string | null;
    subject_en: string | null;
    body_ar: string | null;
    body_en: string | null;
};

export type TemplateDetail = {
    key: string;
    module: string;
    module_label: string;
    variables: string[];
    defaults: Record<
        'ar' | 'en',
        { subject: string | null; body: string | null }
    >;
    values: TemplateFields;
    customized: boolean;
    updated_at: string | null;
    updated_by: string | null;
};

export type TemplatePreview = Record<
    'ar' | 'en',
    { subject: string; html: string; text: string }
>;

export type DeliveryRow = {
    id: string;
    notification_id: string;
    key: string;
    title: string;
    category: string;
    recipient: string | null;
    member_number: string | null;
    channel: ChannelValue;
    channel_label: string;
    status: string;
    status_label: string;
    reason: string | null;
    attempts: number;
    provider: string | null;
    queued_at: string | null;
    sent_at: string | null;
    updated_at: string | null;
    can_retry: boolean;
};
