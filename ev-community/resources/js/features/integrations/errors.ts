import { toast } from 'sonner';

/**
 * Business-rule violations come back as a validation error keyed `domain` (see bootstrap/app.php).
 * Action buttons without a form surface them (or the first field error) as a toast.
 */
export function toastFirstError(
    errors: Record<string, string | undefined>,
): void {
    const message =
        errors.domain ??
        Object.values(errors).find(
            (value): value is string =>
                typeof value === 'string' && value !== '',
        );
    if (message) {
        toast.error(message);
    }
}
