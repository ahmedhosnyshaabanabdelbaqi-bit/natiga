import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useId, useMemo, useRef, useState } from 'react';
import { FormField } from '@/components/shared/form-field';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';

export const CONFIRM_REASON_MIN_LENGTH = 5;

export type ConfirmDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: ReactNode;
    description?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Red confirm button + "cannot be undone" note. */
    destructive?: boolean;
    /** Ask for a reason (min 5 chars, validated client-side) and pass it to onConfirm. */
    requireReason?: boolean;
    reasonLabel?: string;
    reasonPlaceholder?: string;
    /** Externally controlled busy state (e.g. Inertia `processing`). */
    processing?: boolean;
    /** Called on confirm. When it returns a promise the dialog shows a spinner until it settles. */
    onConfirm: (reason?: string) => void | Promise<unknown>;
    onCancel?: () => void;
    /** Extra content between the description and the footer. */
    children?: ReactNode;
};

/** Accessible confirmation (Radix AlertDialog) with optional reason and busy state. */
export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    cancelLabel,
    destructive = false,
    requireReason = false,
    reasonLabel,
    reasonPlaceholder,
    processing = false,
    onConfirm,
    onCancel,
    children,
}: ConfirmDialogProps) {
    const [reason, setReason] = useState('');
    const [reasonError, setReasonError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const reasonId = useId();
    const busy = processing || pending;

    const close = (next: boolean) => {
        if (busy && !next) {
            return;
        }
        if (!next) {
            setReason('');
            setReasonError(null);
        }
        onOpenChange(next);
    };

    const handleConfirm = async () => {
        const trimmed = reason.trim();
        if (requireReason && trimmed.length < CONFIRM_REASON_MIN_LENGTH) {
            setReasonError(t('core.errors.reason_required'));
            document.getElementById(reasonId)?.focus();
            return;
        }
        setReasonError(null);
        const result = onConfirm(requireReason ? trimmed : undefined);
        if (result instanceof Promise) {
            setPending(true);
            try {
                await result;
            } finally {
                setPending(false);
            }
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={close}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {description ?? t('core.confirm.message')}
                        {destructive ? <span className="mt-1 block font-medium text-danger">{t('core.confirm.irreversible')}</span> : null}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                {children}
                {requireReason ? (
                    <FormField id={reasonId} label={reasonLabel ?? t('ui.confirm.reason_label')} required error={reasonError}>
                        <Textarea
                            value={reason}
                            onChange={(event) => {
                                setReason(event.target.value);
                                if (reasonError && event.target.value.trim().length >= CONFIRM_REASON_MIN_LENGTH) {
                                    setReasonError(null);
                                }
                            }}
                            placeholder={reasonPlaceholder ?? t('ui.confirm.reason_placeholder')}
                            minLength={CONFIRM_REASON_MIN_LENGTH}
                            rows={3}
                            disabled={busy}
                            autoFocus
                        />
                    </FormField>
                ) : null}
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy} onClick={() => onCancel?.()}>
                        {cancelLabel ?? t('core.actions.cancel')}
                    </AlertDialogCancel>
                    <Button type="button" variant={destructive ? 'destructive' : 'default'} disabled={busy} onClick={() => void handleConfirm()} data-test="confirm-dialog-confirm">
                        {busy ? <Spinner /> : null}
                        {confirmLabel ?? t('core.actions.confirm')}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

export type ConfirmOptions = Pick<
    ConfirmDialogProps,
    'title' | 'description' | 'confirmLabel' | 'cancelLabel' | 'destructive' | 'requireReason' | 'reasonLabel' | 'reasonPlaceholder'
>;

export type ConfirmResult = { confirmed: boolean; reason?: string };

type ConfirmFn = (options: ConfirmOptions) => Promise<ConfirmResult>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Mount once (per portal layout) to enable the imperative `useConfirm()` hook.
 * The portal layouts do not mount it yet; the integration pass adds it there.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [options, setOptions] = useState<ConfirmOptions | null>(null);
    const resolver = useRef<((result: ConfirmResult) => void) | null>(null);

    const settle = useCallback((result: ConfirmResult) => {
        resolver.current?.(result);
        resolver.current = null;
        setOptions(null);
    }, []);

    const confirm = useCallback<ConfirmFn>((next) => {
        resolver.current?.({ confirmed: false });
        setOptions(next);
        return new Promise<ConfirmResult>((resolve) => {
            resolver.current = resolve;
        });
    }, []);

    const value = useMemo(() => confirm, [confirm]);

    return (
        <ConfirmContext.Provider value={value}>
            {children}
            {options ? (
                <ConfirmDialog
                    open
                    onOpenChange={(open) => {
                        if (!open) {
                            settle({ confirmed: false });
                        }
                    }}
                    onConfirm={(reason) => settle({ confirmed: true, reason })}
                    {...options}
                />
            ) : null}
        </ConfirmContext.Provider>
    );
}

/**
 * Imperative confirmation: `const { confirmed, reason } = await confirm({ title, destructive: true })`.
 * Requires a `<ConfirmProvider>` above in the tree.
 */
export function useConfirm(): ConfirmFn {
    const confirm = useContext(ConfirmContext);
    if (!confirm) {
        throw new Error('useConfirm() must be used inside <ConfirmProvider>. Mount it in the portal layout or around your page.');
    }
    return confirm;
}
