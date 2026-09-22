import type { ReactElement, ReactNode } from 'react';
import { cloneElement, isValidElement, useId } from 'react';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type FormFieldControlProps = {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': boolean | undefined;
    'aria-required': boolean | undefined;
};

type FormFieldProps = {
    label: ReactNode;
    /** Id of the control. Generated when omitted (and injected into the child). */
    id?: string;
    required?: boolean;
    /** Show an "(optional)" hint next to the label. */
    optional?: boolean;
    /** Help text rendered under the control and linked via aria-describedby. */
    hint?: ReactNode;
    /** Server/client validation error (string from Inertia `errors`). */
    error?: string | null;
    /** Visually hide the label (still announced by screen readers). */
    hideLabel?: boolean;
    /** Put label and control on one row (checkbox/switch style). */
    inline?: boolean;
    /** A single control element (id/aria props are injected) or a render function receiving them. */
    children: ReactNode | ((props: FormFieldControlProps) => ReactNode);
    className?: string;
};

/**
 * Accessible form field: label + control + hint + error with ids wired together.
 * Errors come from Inertia's `errors` object; validation happens on the server.
 */
export function FormField({
    label,
    id: givenId,
    required = false,
    optional = false,
    hint,
    error,
    hideLabel = false,
    inline = false,
    children,
    className,
}: FormFieldProps) {
    const generated = useId();
    const id = givenId ?? `field-${generated}`;
    const hintId = hint ? `${id}-hint` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const describedBy =
        [errorId, hintId].filter(Boolean).join(' ') || undefined;

    const controlProps: FormFieldControlProps = {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required ? true : undefined,
    };

    let control: ReactNode;
    if (typeof children === 'function') {
        control = children(controlProps);
    } else if (isValidElement(children)) {
        const element = children as ReactElement<Record<string, unknown>>;
        const injected: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(controlProps)) {
            if (element.props[key] === undefined && value !== undefined) {
                injected[key] = value;
            }
        }
        control = cloneElement(element, injected);
    } else {
        control = children;
    }

    const labelNode = (
        <Label htmlFor={id} className={cn('gap-1', hideLabel && 'sr-only')}>
            <span>{label}</span>
            {required ? (
                <span aria-hidden="true" className="text-danger">
                    *
                </span>
            ) : null}
            {optional && !required ? (
                <span className="text-xs font-normal text-muted-foreground">
                    ({t('core.labels.optional')})
                </span>
            ) : null}
        </Label>
    );

    return (
        <div
            className={cn('grid gap-2', className)}
            data-slot="form-field"
            data-invalid={error ? 'true' : undefined}
        >
            {inline ? (
                <div className="flex items-center gap-3">
                    {control}
                    {labelNode}
                </div>
            ) : (
                <>
                    {labelNode}
                    {control}
                </>
            )}
            {hint ? (
                <p id={hintId} className="text-xs text-muted-foreground">
                    {hint}
                </p>
            ) : null}
            {error ? (
                <p id={errorId} role="alert" className="text-sm text-danger">
                    {error}
                </p>
            ) : null}
        </div>
    );
}

type FormActionsProps = {
    children: ReactNode;
    align?: 'start' | 'end' | 'between';
    /** Stick to the bottom of the viewport on small screens (default true). */
    sticky?: boolean;
    className?: string;
};

/** Actions row for forms: sticky at the bottom on mobile, static on ≥md screens. */
export function FormActions({
    children,
    align = 'end',
    sticky = true,
    className,
}: FormActionsProps) {
    return (
        <div
            data-slot="form-actions"
            className={cn(
                'flex flex-wrap items-center gap-2',
                align === 'end' && 'justify-end',
                align === 'start' && 'justify-start',
                align === 'between' && 'justify-between',
                sticky &&
                    'safe-bottom sticky bottom-0 z-10 -mx-4 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none',
                className,
            )}
        >
            {children}
        </div>
    );
}
