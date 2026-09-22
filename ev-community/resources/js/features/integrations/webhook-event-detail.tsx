import { DescriptionList } from '@/components/shared/section-card';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Code } from '@/components/ui/code';
import { t } from '@/lib/i18n';
import {
    SignatureBadge,
    WebhookStatusBadge,
} from '@/features/integrations/badges';
import { JsonBlock } from '@/features/integrations/json-block';
import type { WebhookEventDetail } from '@/features/integrations/types';

/** Body of a webhook event (drawer and full page): identity, outcome, sanitised headers and payload. */
export function WebhookEventDetailBody({
    event,
}: {
    event: WebhookEventDetail;
}) {
    const awaitingHandler =
        !event.has_handler &&
        event.signature_valid === true &&
        event.status !== 'processed';

    return (
        <div className="space-y-6">
            {event.error ? (
                <InlineAlert
                    tone={event.status === 'ignored' ? 'warning' : 'danger'}
                    title={t('integrations.webhooks.columns.error')}
                >
                    <span className="break-words whitespace-pre-line">
                        {event.error}
                    </span>
                </InlineAlert>
            ) : null}
            {awaitingHandler ? (
                <InlineAlert tone="info">
                    {t('integrations.webhooks.no_handler_hint')}
                </InlineAlert>
            ) : null}

            <DescriptionList
                items={[
                    {
                        label: t('integrations.webhooks.columns.provider'),
                        value: t(`integrations.categories.${event.provider}`),
                    },
                    {
                        label: t('integrations.webhooks.columns.driver'),
                        value: event.driver,
                        type: 'code',
                    },
                    {
                        label: t('integrations.webhooks.columns.event_type'),
                        value: event.event_type,
                        type: 'code',
                    },
                    {
                        label: t('integrations.webhooks.columns.external_id'),
                        value: event.external_event_id,
                        type: 'code',
                    },
                    {
                        label: t('integrations.webhooks.columns.status'),
                        value: <WebhookStatusBadge status={event.status} />,
                    },
                    {
                        label: t('integrations.webhooks.columns.signature'),
                        value: <SignatureBadge valid={event.signature_valid} />,
                    },
                    {
                        label: t('integrations.webhooks.columns.retries'),
                        value: String(event.retry_count),
                    },
                    {
                        label: t('integrations.webhooks.columns.received_at'),
                        value: event.received_at,
                        type: 'datetime',
                    },
                    {
                        label: t('integrations.webhooks.columns.processed_at'),
                        value: event.processed_at,
                        type: 'datetime',
                    },
                    {
                        label: t('integrations.webhooks.fingerprint'),
                        value: (
                            <Code className="max-w-full truncate align-bottom">
                                {event.fingerprint}
                            </Code>
                        ),
                        full: true,
                    },
                ]}
            />

            <section className="space-y-2">
                <h3 className="text-sm font-medium">
                    {t('integrations.webhooks.payload')}
                </h3>
                <p className="text-xs text-muted-foreground">
                    {t('integrations.webhooks.sanitised_note')}
                </p>
                <JsonBlock
                    value={event.payload}
                    label={t('integrations.webhooks.payload')}
                />
            </section>

            <section className="space-y-2">
                <h3 className="text-sm font-medium">
                    {t('integrations.webhooks.headers')}
                </h3>
                <JsonBlock
                    value={event.headers}
                    label={t('integrations.webhooks.headers')}
                />
            </section>
        </div>
    );
}
