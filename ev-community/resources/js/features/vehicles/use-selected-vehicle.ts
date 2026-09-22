import { router, usePage } from '@inertiajs/react';
import { useCallback } from 'react';
import type { SelectedVehicle, VehicleSelection } from '@/features/vehicles/types';
import { useLocale } from '@/lib/i18n';
import { deselect, select } from '@/routes/public/vehicles';

export type UseSelectedVehicle = {
    /** Member's primary garage vehicle, else the guest's session pick, else null. */
    vehicle: SelectedVehicle | null;
    /** True when the selection comes from the member's garage (change it there, not here). */
    fromGarage: boolean;
    /** Store a session selection (guests / members without a garage vehicle). Reloads the current page. */
    choose: (selection: VehicleSelection, options?: { onSuccess?: () => void; onFinish?: () => void }) => void;
    /** Forget the session selection. */
    clear: () => void;
};

/**
 * The vehicle every store/search/compatibility UI should use. Backed by the shared Inertia prop
 * `selectedVehicle` (App\Modules\Vehicles\Services\SelectedVehicle) — never by client storage.
 */
export function useSelectedVehicle(): UseSelectedVehicle {
    const page = usePage();
    const vehicle = (page.props.selectedVehicle as SelectedVehicle | null | undefined) ?? null;
    const { locale } = useLocale();

    const choose = useCallback<UseSelectedVehicle['choose']>(
        (selection, options = {}) => {
            router.post(
                select(locale).url,
                { make_id: selection.make_id, model_id: selection.model_id, variant_id: selection.variant_id, year: selection.year },
                { preserveScroll: true, preserveState: true, onSuccess: () => options.onSuccess?.(), onFinish: () => options.onFinish?.() },
            );
        },
        [locale],
    );

    const clear = useCallback(() => {
        router.delete(deselect(locale).url, { preserveScroll: true, preserveState: true });
    }, [locale]);

    return { vehicle, fromGarage: vehicle?.source === 'garage', choose, clear };
}
