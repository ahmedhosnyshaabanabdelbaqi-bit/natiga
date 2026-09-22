import { usePage } from '@inertiajs/react';
import { InlineAlert } from '@/components/shared/inline-alert';

/**
 * Validation / business-rule errors returned by actions triggered from dialogs and row buttons (they have no
 * form field to attach to). Renders nothing when there are no errors.
 */
export function PageErrors({ ignore = [] }: { ignore?: string[] }) {
    const { errors } = usePage().props as { errors?: Record<string, string> };
    const messages = Object.entries(errors ?? {})
        .filter(([key]) => !ignore.includes(key))
        .map(([, message]) => message)
        .filter((message, index, all) => typeof message === 'string' && message !== '' && all.indexOf(message) === index);
    if (messages.length === 0) {
        return null;
    }
    return (
        <InlineAlert tone="danger">
            {messages.length === 1 ? (
                messages[0]
            ) : (
                <ul className="list-disc ps-4">
                    {messages.map((message) => (
                        <li key={message}>{message}</li>
                    ))}
                </ul>
            )}
        </InlineAlert>
    );
}
