/** Props contracts of the Integrations admin pages (mirror the controllers). */
import type { AnyPaginated } from '@/components/shared/pagination';

export type HealthStatus =
    | 'operational'
    | 'degraded'
    | 'unavailable'
    | 'not_configured'
    | 'unknown';

export type IntegrationKey =
    | 'payment'
    | 'map'
    | 'email'
    | 'sms'
    | 'whatsapp'
    | 'shipping'
    | 'charging'
    | 'exchange_rate';

/** One row of `Integrations::matrix()`. */
export type MatrixRow = {
    key: IntegrationKey;
    name: string;
    status: HealthStatus;
    /** Configured driver name; suffixed with "✕" when it could not be honoured. */
    driver: string;
    driver_label: string;
    configured: boolean;
    last_checked_at: string | null;
    last_success_at: string | null;
    last_error: string | null;
    fallback: string;
    webhook_url: string | null;
    docs: string;
    env: string[];
    public_config: Record<string, unknown>;
};

export type IntegrationEventRow = {
    id: number;
    provider: string;
    direction: 'outbound' | 'inbound';
    operation: string;
    reference: string | null;
    status: 'success' | 'failed' | 'timeout';
    duration_ms: number | null;
    error: string | null;
    created_at: string | null;
};

export type WebhookStatus =
    | 'received'
    | 'processing'
    | 'processed'
    | 'failed'
    | 'ignored';

export type GeocodeResult = {
    address: string;
    found: boolean;
    result: {
        lat: number;
        lng: number;
        display_name: string | null;
        country_code: string | null;
        city: string | null;
        source: string;
    } | null;
    directions_url: string | null;
    geo_uri: string | null;
};

export type IntegrationsIndexProps = {
    matrix: MatrixRow[];
    recentEvents: IntegrationEventRow[];
    webhookSummary: Record<WebhookStatus, number>;
    email: { configured: boolean; mailer: string; to: string };
    map: { configured: boolean; driver: string };
    geocodeResult: GeocodeResult | null;
    canManage: boolean;
};

export type WebhookEventRow = {
    id: number;
    provider: string;
    driver: string | null;
    event_type: string | null;
    external_event_id: string | null;
    signature_valid: boolean | null;
    status: WebhookStatus;
    retry_count: number;
    error_short: string | null;
    received_at: string | null;
    processed_at: string | null;
    can_retry: boolean;
};

export type WebhookEventDetail = WebhookEventRow & {
    headers: Record<string, unknown>;
    payload: Record<string, unknown> | unknown[];
    fingerprint: string;
    error: string | null;
    has_handler: boolean;
};

export type WebhookEventsIndexProps = {
    events: AnyPaginated<WebhookEventRow>;
    filters: {
        provider: string | null;
        status: WebhookStatus | null;
        q: string | null;
    };
    providers: IntegrationKey[];
    statuses: WebhookStatus[];
    selected?: WebhookEventDetail | null;
    canManage: boolean;
};

export type WebhookEventShowProps = {
    event: WebhookEventDetail;
    canManage: boolean;
};

export type Currency = { code: string; name: string; is_base: boolean };

export type LatestRate = {
    currency: string;
    name: string;
    rate: string | null;
    source: string | null;
    rate_date: string | null;
    stale: boolean;
};

export type ExchangeRateRow = {
    id: number;
    base_currency: string;
    quote_currency: string;
    rate: string;
    rate_raw: string;
    source: string;
    source_reference: string | null;
    rate_date: string;
    reason: string | null;
    entered_by: string | null;
    created_at: string | null;
};

export type ExchangeRatesIndexProps = {
    baseCurrency: string;
    currencies: Currency[];
    latest: LatestRate[];
    rates: AnyPaginated<ExchangeRateRow>;
    filters: { base: string | null; source: 'manual' | 'provider' | null };
    provider: { driver: string; configured: boolean; supports_sync: boolean };
    canManage: boolean;
};
