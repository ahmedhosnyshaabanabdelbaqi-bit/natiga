import { Head, Link } from '@inertiajs/react';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { index as integrationsIndex } from '@/routes/admin/integrations';
import {
    index as webhookEventsIndex,
    show as webhookEventShow,
} from '@/routes/admin/integrations/webhook-events';
import { WebhookStatusBadge } from '@/features/integrations/badges';
import { RetryWebhookButton } from '@/features/integrations/retry-webhook-button';
import type { WebhookEventShowProps } from '@/features/integrations/types';
import { WebhookEventDetailBody } from '@/features/integrations/webhook-event-detail';

export default function WebhookEventShow({
    event,
    canManage,
}: WebhookEventShowProps) {
    const title = t('integrations.webhooks.detail_title', { id: event.id });

    return (
        <>
            <Head title={title} />
            <div className="space-y-6">
                <PageHeader
                    title={title}
                    description={t(`integrations.categories.${event.provider}`)}
                    actions={
                        <>
                            <Button asChild variant="ghost">
                                <Link href={webhookEventsIndex.url()} prefetch>
                                    <ArrowLeft
                                        aria-hidden="true"
                                        className="rtl:rotate-180"
                                    />
                                    {t('integrations.webhooks.back_to_list')}
                                </Link>
                            </Button>
                            <RetryWebhookButton
                                event={event}
                                canManage={canManage}
                                size="default"
                            />
                        </>
                    }
                >
                    <div className="mt-2">
                        <WebhookStatusBadge status={event.status} />
                    </div>
                </PageHeader>
                <SectionCard>
                    <WebhookEventDetailBody event={event} />
                </SectionCard>
            </div>
        </>
    );
}

WebhookEventShow.layout = (props: WebhookEventShowProps) => ({
    breadcrumbs: [
        { title: t('integrations.title'), href: integrationsIndex.url() },
        {
            title: t('integrations.webhooks.title'),
            href: webhookEventsIndex.url(),
        },
        {
            title: t('integrations.webhooks.detail_title', {
                id: props.event.id,
            }),
            href: webhookEventShow.url(props.event.id),
        },
    ],
});
