import { router } from '@inertiajs/react';
import { useEffect, useState } from 'react';

/**
 * True while a full GET visit to the current page is in flight (filters, pagination).
 * Partial reloads (`only: [...]`, e.g. opening the detail drawer) and prefetches are ignored so the
 * list does not flash skeletons while only a side panel is loading.
 */
export function useListLoading(): boolean {
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        const path = window.location.pathname;
        const offStart = router.on('start', (event) => {
            const visit = event.detail.visit;
            if (
                visit.method === 'get' &&
                !visit.prefetch &&
                visit.only.length === 0 &&
                visit.url.pathname === path
            ) {
                setLoading(true);
            }
        });
        const offFinish = router.on('finish', () => setLoading(false));
        return () => {
            offStart();
            offFinish();
        };
    }, []);
    return loading;
}
