import { useEffect, useRef, useState } from 'react';
import { requestJson } from '@/features/notifications/http';

export const UNREAD_POLL_INTERVAL_MS = 60_000;

/**
 * Polls a `…/unread-count` endpoint (default every 60 s, paused while the tab is hidden) and returns the
 * latest count. The server caches the count for 60 s, so polling is cheap. Portal layouts can use this for
 * the header bell together with the shared `unreadNotifications` prop as the initial value.
 */
export function useUnreadCount(
    url: string | null,
    initial: number,
    intervalMs: number = UNREAD_POLL_INTERVAL_MS,
): number {
    const [count, setCount] = useState(initial);
    const initialRef = useRef(initial);

    useEffect(() => {
        if (initialRef.current !== initial) {
            initialRef.current = initial;
            setCount(initial);
        }
    }, [initial]);

    useEffect(() => {
        if (!url) {
            return;
        }
        let controller: AbortController | null = null;
        const tick = async () => {
            if (document.visibilityState === 'hidden') {
                return;
            }
            controller?.abort();
            controller = new AbortController();
            try {
                const result = await requestJson<{ unread: number }>(
                    'get',
                    url,
                    undefined,
                    controller.signal,
                );
                if (result.ok && typeof result.data.unread === 'number') {
                    setCount(result.data.unread);
                }
            } catch {
                // Aborted or offline: keep the last known count.
            }
        };
        const timer = window.setInterval(() => void tick(), intervalMs);
        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                void tick();
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
            controller?.abort();
        };
    }, [url, intervalMs]);

    return count;
}
