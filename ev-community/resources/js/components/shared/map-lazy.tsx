import { lazy, Suspense } from 'react';
import type {
    AddressMapPickerProps,
    LatLng,
    MapViewProps,
} from '@/components/shared/map';
import { Skeleton } from '@/components/ui/skeleton';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/*
 * Lazy entry points used by the `@/components/shared` barrel: Leaflet (JS + CSS) is downloaded only
 * when a map actually renders, so pages that import other shared components stay light.
 * Import from `@/components/shared/map` directly when a page is all about the map.
 */
const LazyMapView = lazy(() =>
    import('@/components/shared/map').then((module) => ({
        default: module.MapView,
    })),
);
const LazyAddressMapPicker = lazy(() =>
    import('@/components/shared/map').then((module) => ({
        default: module.AddressMapPicker,
    })),
);
const LazyUserLocationButton = lazy(() =>
    import('@/components/shared/map').then((module) => ({
        default: module.UserLocationButton,
    })),
);

function MapSkeleton({ className }: { className?: string }) {
    return (
        <div
            aria-busy="true"
            className={cn(
                'relative h-80 overflow-hidden rounded-xl border',
                className,
            )}
        >
            <Skeleton className="size-full rounded-none" />
            <span className="sr-only">{t('ui.map.loading')}</span>
        </div>
    );
}

export function MapView(props: MapViewProps) {
    return (
        <Suspense fallback={<MapSkeleton className={props.className} />}>
            <LazyMapView {...props} />
        </Suspense>
    );
}

export function AddressMapPicker(props: AddressMapPickerProps) {
    return (
        <Suspense
            fallback={
                <MapSkeleton className={cn('h-72', props.mapClassName)} />
            }
        >
            <LazyAddressMapPicker {...props} />
        </Suspense>
    );
}

/** Must be rendered inside a `MapView` (it reads the Leaflet map from context). */
export function UserLocationButton(props: {
    onLocate?: (position: LatLng) => void;
    zoom?: number;
}) {
    return (
        <Suspense fallback={null}>
            <LazyUserLocationButton {...props} />
        </Suspense>
    );
}
