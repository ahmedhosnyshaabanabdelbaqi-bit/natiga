// Credit: https://usehooks-ts.com/
import { useCallback, useState } from 'react';

export type CopiedValue = string | null;
export type CopyFn = (text: string) => Promise<boolean>;
export type UseClipboardReturn = [CopiedValue, CopyFn];

/**
 * Copies text with the async Clipboard API. Resolves `false` when the API is unavailable
 * (insecure context, old browser) or the browser refuses, so callers can show their own message.
 */
export function useClipboard(): UseClipboardReturn {
    const [copiedText, setCopiedText] = useState<CopiedValue>(null);

    const copy: CopyFn = useCallback(async (text) => {
        if (typeof navigator === 'undefined' || !navigator.clipboard) {
            return false;
        }

        try {
            await navigator.clipboard.writeText(text);
            setCopiedText(text);

            return true;
        } catch {
            setCopiedText(null);

            return false;
        }
    }, []);

    return [copiedText, copy];
}
