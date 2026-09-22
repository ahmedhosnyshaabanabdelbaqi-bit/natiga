import { router, usePage } from '@inertiajs/react';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { t } from '@/lib/i18n';

/** Activate / deactivate a master-data row (POST …/toggle, audited server-side). */
export function ActiveToggle({
    url,
    active,
    label,
    disabled = false,
}: {
    url: string;
    active: boolean;
    label: string;
    disabled?: boolean;
}) {
    const [busy, setBusy] = useState(false);
    return (
        <Switch
            checked={active}
            disabled={disabled || busy}
            aria-label={label}
            onCheckedChange={() =>
                router.post(
                    url,
                    {},
                    {
                        preserveScroll: true,
                        preserveState: true,
                        onStart: () => setBusy(true),
                        onFinish: () => setBusy(false),
                    },
                )
            }
        />
    );
}

/**
 * Delete a master-data row after confirmation. Rows still referenced (models, variants, member vehicles)
 * are refused by the server with a clear message; deactivate them instead.
 */
export function DeleteRowButton({
    url,
    name,
    disabled = false,
    disabledReason,
}: {
    url: string;
    name: string;
    disabled?: boolean;
    disabledReason?: string;
}) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    return (
        <>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                title={disabled ? disabledReason : t('core.actions.delete')}
                aria-label={`${t('core.actions.delete')}: ${name}`}
                onClick={() => setOpen(true)}
            >
                <Trash2 className="size-4 text-danger" aria-hidden="true" />
            </Button>
            <ConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title={t('vehicles.admin.delete_title', { name })}
                description={t('vehicles.admin.delete_description')}
                confirmLabel={t('core.actions.delete')}
                destructive
                processing={busy}
                onConfirm={() =>
                    router.delete(url, {
                        preserveScroll: true,
                        onStart: () => setBusy(true),
                        onFinish: () => {
                            setBusy(false);
                            setOpen(false);
                        },
                    })
                }
            />
        </>
    );
}

/** Business-rule errors (DomainException without a field) returned by the last visit, e.g. "record in use". */
export function DomainErrorAlert() {
    const { errors } = usePage().props as {
        errors?: Record<string, string | undefined>;
    };
    const message = errors?.domain;
    return message ? <InlineAlert tone="danger">{message}</InlineAlert> : null;
}
