import { router } from '@inertiajs/react';
import { Ban, CalendarX, CheckCircle2, RotateCcw, Undo2, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { useCan } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { approve, expire, reactivate, reject, reopen, suspend } from '@/routes/admin/members';
import type { RouteDefinition } from '@/wayfinder';
import type { MembershipDetail, MembershipStatus } from './types';

type ActionKey = 'approve' | 'reject' | 'suspend' | 'reactivate' | 'expire' | 'reopen';

type ActionDef = {
    key: ActionKey;
    permission: string;
    route: (id: string) => RouteDefinition<'post'>;
    icon: LucideIcon;
    variant: 'default' | 'outline' | 'destructive';
    requireReason: boolean;
    destructive: boolean;
};

const ACTIONS: Record<ActionKey, ActionDef> = {
    approve: { key: 'approve', permission: 'members.approve', route: (id) => approve(id), icon: CheckCircle2, variant: 'default', requireReason: false, destructive: false },
    reject: { key: 'reject', permission: 'members.approve', route: (id) => reject(id), icon: XCircle, variant: 'destructive', requireReason: true, destructive: false },
    suspend: { key: 'suspend', permission: 'members.suspend', route: (id) => suspend(id), icon: Ban, variant: 'destructive', requireReason: true, destructive: false },
    reactivate: { key: 'reactivate', permission: 'members.suspend', route: (id) => reactivate(id), icon: RotateCcw, variant: 'default', requireReason: false, destructive: false },
    expire: { key: 'expire', permission: 'members.edit', route: (id) => expire(id), icon: CalendarX, variant: 'outline', requireReason: false, destructive: false },
    reopen: { key: 'reopen', permission: 'members.approve', route: (id) => reopen(id), icon: Undo2, variant: 'outline', requireReason: false, destructive: false },
};

/** Maps an allowed target status (from the server state machine) to the endpoint that performs it. */
function actionFor(from: MembershipStatus, to: MembershipStatus): ActionKey {
    switch (to) {
        case 'active':
            return from === 'pending' ? 'approve' : 'reactivate';
        case 'rejected':
            return 'reject';
        case 'suspended':
            return 'suspend';
        case 'expired':
            return 'expire';
        case 'pending':
            return 'reopen';
    }
}

export function firstError(errors: Record<string, string>): string {
    return Object.values(errors)[0] ?? t('core.states.error');
}

/** Buttons for the transitions the server allows from the current status, filtered by permission. */
export function MemberStatusActions({ membership }: { membership: MembershipDetail }) {
    const can = useCan();
    const [pending, setPending] = useState<ActionDef | null>(null);
    const [processing, setProcessing] = useState(false);

    const actions = membership.allowed_transitions.map((to) => ACTIONS[actionFor(membership.status, to)]).filter((action) => can(action.permission));
    if (actions.length === 0) {
        return null;
    }

    const run = (reason?: string) => {
        if (!pending) {
            return;
        }
        setProcessing(true);
        router.post(pending.route(membership.id).url, reason ? { reason } : {}, {
            preserveScroll: true,
            onSuccess: () => setPending(null),
            onError: (errors) => toast.error(firstError(errors)),
            onFinish: () => setProcessing(false),
        });
    };

    return (
        <>
            {actions.map((action) => (
                <Button key={action.key} type="button" size="sm" variant={action.variant} onClick={() => setPending(action)}>
                    <action.icon className="size-4" aria-hidden="true" />
                    {t(`members.admin.actions.${action.key}`)}
                </Button>
            ))}
            <ConfirmDialog
                open={pending !== null}
                onOpenChange={(open) => (!open && !processing ? setPending(null) : undefined)}
                title={pending ? t(`members.admin.confirm.${pending.key}_title`) : ''}
                description={pending ? t(`members.admin.confirm.${pending.key}_text`) : undefined}
                confirmLabel={pending ? t(`members.admin.actions.${pending.key}`) : undefined}
                requireReason={pending?.requireReason ?? false}
                destructive={pending?.destructive ?? false}
                processing={processing}
                onConfirm={run}
            />
        </>
    );
}
