import { router } from '@inertiajs/react';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { t } from '@/lib/i18n';
import { retry } from '@/routes/admin/integrations/webhook-events';
import { toastFirstError } from '@/features/integrations/errors';
import type { WebhookEventRow } from '@/features/integrations/types';

/**
 * "Retry" for a failed, signature-verified webhook event (integrations.manage).
 * Rendered disabled with an explanation when the event cannot be retried; hidden without permission.
 */
export function RetryWebhookButton({
    event,
    canManage,
    size = 'sm',
    only,
}: {
    event: Pick<WebhookEventRow, 'id' | 'can_retry'>;
    canManage: boolean;
    size?: 'sm' | 'default';
    /** Props to reload after the retry (partial reload); all props when omitted. */
    only?: string[];
}) {
    const [open, setOpen] = useState(false);
    const [processing, setProcessing] = useState(false);

    if (!canManage) {
        return null;
    }

    if (!event.can_retry) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    {/* Disabled buttons swallow pointer events; the wrapper keeps the tooltip reachable. */}
                    <span
                        tabIndex={0}
                        className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
                    >
                        <Button
                            type="button"
                            variant="outline"
                            size={size}
                            disabled
                        >
                            <RotateCcw aria-hidden="true" />
                            {t('integrations.actions.retry')}
                        </Button>
                    </span>
                </TooltipTrigger>
                <TooltipContent>
                    {t('integrations.webhooks.retry_not_allowed_hint')}
                </TooltipContent>
            </Tooltip>
        );
    }

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size={size}
                onClick={() => setOpen(true)}
            >
                <RotateCcw aria-hidden="true" />
                {t('integrations.actions.retry')}
            </Button>
            <ConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title={t('integrations.webhooks.retry_confirm_title', {
                    id: event.id,
                })}
                description={t(
                    'integrations.webhooks.retry_confirm_description',
                )}
                confirmLabel={t('integrations.actions.retry')}
                processing={processing}
                onConfirm={() => {
                    router.post(
                        retry.url(event.id),
                        {},
                        {
                            preserveScroll: true,
                            preserveState: true,
                            only,
                            onStart: () => setProcessing(true),
                            onError: toastFirstError,
                            onFinish: () => {
                                setProcessing(false);
                                setOpen(false);
                            },
                        },
                    );
                }}
            />
        </>
    );
}
