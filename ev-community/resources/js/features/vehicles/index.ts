/**
 * Public API of the vehicles feature for other modules (store, search, charging, maintenance...):
 *
 *   import { VehicleSelector, useSelectedVehicle } from '@/features/vehicles';
 *
 * See docs/modules/vehicles-garage.md.
 */
export {
    findMake,
    findModel,
    findVariant,
    marketLabel,
    variantLabel,
    yearOptions,
    yearRange,
} from '@/features/vehicles/catalog';
export type * from '@/features/vehicles/types';
export { useSelectedVehicle } from '@/features/vehicles/use-selected-vehicle';
export type { UseSelectedVehicle } from '@/features/vehicles/use-selected-vehicle';
export { useVehicleCatalog } from '@/features/vehicles/use-vehicle-catalog';
export { VehiclePicker } from '@/features/vehicles/vehicle-picker';
export { VehicleSelector } from '@/features/vehicles/vehicle-selector';
