import { useCallback, useEffect, useState } from 'react';
import type { VehicleCatalog } from '@/features/vehicles/types';
import { useLocale } from '@/lib/i18n';
import { data as vehicleDataRoute } from '@/routes/public/vehicles';

const cache = new Map<string, Promise<VehicleCatalog>>();

function load(locale: string): Promise<VehicleCatalog> {
    let pending = cache.get(locale);
    if (!pending) {
        pending = fetch(vehicleDataRoute(locale).url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' }).then(async (response) => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return (await response.json()) as VehicleCatalog;
        });
        pending.catch(() => cache.delete(locale));
        cache.set(locale, pending);
    }
    return pending;
}

export type UseVehicleCatalog = { catalog: VehicleCatalog | null; loading: boolean; failed: boolean; retry: () => void };

/**
 * Localized vehicle master data from `GET /{locale}/vehicles/data` (cached 1 h on the server, once per page
 * session in memory). Pass `initial` when the page already received the catalog as a prop, and
 * `enabled = false` to postpone the request (e.g. until a dialog opens).
 */
export function useVehicleCatalog(initial?: VehicleCatalog | null, enabled = true): UseVehicleCatalog {
    const { locale } = useLocale();
    const [catalog, setCatalog] = useState<VehicleCatalog | null>(initial ?? null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (initial) {
            setCatalog(initial);
            return;
        }
        if (!enabled) {
            return;
        }
        let active = true;
        setFailed(false);
        load(locale)
            .then((result) => {
                if (active) {
                    setCatalog(result);
                }
            })
            .catch(() => {
                if (active) {
                    setFailed(true);
                }
            });
        return () => {
            active = false;
        };
    }, [initial, enabled, locale, attempt]);

    const retry = useCallback(() => setAttempt((value) => value + 1), []);

    return { catalog, loading: catalog === null && !failed, failed, retry };
}
