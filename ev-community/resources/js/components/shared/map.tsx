import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { LocateFixed, MapPinOff, Search } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
    CircleMarker,
    MapContainer,
    Marker,
    Popup,
    TileLayer,
    Tooltip,
    useMap,
    useMapEvents,
    ZoomControl,
} from 'react-leaflet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { formatNumber } from '@/lib/format';
import { boot, currentDir, isRtl, t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

// Vite fingerprints Leaflet's default marker images; point the default icon at the bundled URLs
// (Leaflet would otherwise prepend a path guessed from the stylesheet and 404).
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })
    ._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

export type LatLng = { lat: number; lng: number };

export type MapBounds = {
    north: number;
    south: number;
    east: number;
    west: number;
    zoom: number;
    center: LatLng;
};

export type MapMarker = {
    id: string | number;
    lat: number;
    lng: number;
    /** Tooltip / accessible name of the marker. */
    title?: string;
    /** Popup content (rendered in the page direction). */
    popup?: ReactNode;
};

/** Debounce applied to `onBoundsChange`. */
export const BOUNDS_DEBOUNCE_MS = 500;
/** Above this many markers, markers are grouped in a pixel grid. */
export const CLUSTER_THRESHOLD = 200;
const CLUSTER_CELL_PX = 64;
/** Consecutive tile failures (without any success) after which the map is declared unavailable. */
const TILE_FAILURE_THRESHOLD = 8;

/** True when a tile provider is configured (`MAP_PROVIDER` is not `none`). */
export function mapConfigured(): boolean {
    const map = boot().map;
    return map.provider !== 'none' && map.tile_url !== '';
}

function escapeHtml(value: string): string {
    return value.replace(
        /[&<>"']/g,
        (char) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            })[char] ?? char,
    );
}

function attributionHtml(): string {
    return `<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">${escapeHtml(t('ui.map.attribution'))}</a>`;
}

function roundCoordinate(value: number): number {
    return Math.round(value * 1e6) / 1e6;
}

function toBounds(map: L.Map): MapBounds {
    const bounds = map.getBounds();
    const center = map.getCenter();
    return {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
        zoom: map.getZoom(),
        center: { lat: center.lat, lng: center.lng },
    };
}

/** Message shown instead of the map when no provider is configured or tiles keep failing. */
export function MapUnavailable({ className }: { className?: string }) {
    return (
        <div
            role="status"
            className={cn(
                'flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-xl border bg-muted/50 p-6 text-center text-sm text-muted-foreground',
                className,
            )}
        >
            <MapPinOff className="size-6" aria-hidden="true" />
            <p className="max-w-sm">{t('core.states.map_unavailable')}</p>
        </div>
    );
}

/** Translates Leaflet's built-in English popup close label. */
function MapI18n() {
    useMapEvents({
        popupopen: (event) => {
            event.popup
                .getElement()
                ?.querySelector('.leaflet-popup-close-button')
                ?.setAttribute('aria-label', t('ui.map.close_popup'));
        },
    });
    return null;
}

function BoundsReporter({
    onChange,
}: {
    onChange: (bounds: MapBounds) => void;
}) {
    const map = useMap();
    const callback = useRef(onChange);

    useEffect(() => {
        callback.current = onChange;
    }, [onChange]);

    useEffect(() => {
        let timer: number | undefined;
        const report = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(
                () => callback.current(toBounds(map)),
                BOUNDS_DEBOUNCE_MS,
            );
        };
        // `moveend` also fires after zooming; report the initial viewport once the map is ready.
        map.on('moveend', report);
        map.whenReady(report);
        return () => {
            window.clearTimeout(timer);
            map.off('moveend', report);
        };
    }, [map]);

    return null;
}

/** Fits the first non-empty marker set once; later marker reloads (e.g. from bounds changes) never move the map. */
function FitToMarkers({ markers }: { markers: MapMarker[] }) {
    const map = useMap();
    const done = useRef(false);

    useEffect(() => {
        if (done.current || markers.length === 0) {
            return;
        }
        done.current = true;
        if (markers.length === 1) {
            map.setView(
                [markers[0].lat, markers[0].lng],
                Math.max(map.getZoom(), 14),
            );
            return;
        }
        map.fitBounds(
            L.latLngBounds(
                markers.map(
                    (marker) => [marker.lat, marker.lng] as [number, number],
                ),
            ),
            { padding: [32, 32], maxZoom: 15 },
        );
    }, [map, markers]);

    return null;
}

function MarkerItem({
    marker,
    onClick,
}: {
    marker: MapMarker;
    onClick?: (marker: MapMarker) => void;
}) {
    return (
        <Marker
            position={[marker.lat, marker.lng]}
            title={marker.title}
            alt={marker.title ?? t('ui.map.marker')}
            eventHandlers={
                onClick ? { click: () => onClick(marker) } : undefined
            }
        >
            {marker.popup ? (
                <Popup>
                    <div dir={currentDir()} className="text-start">
                        {marker.popup}
                    </div>
                </Popup>
            ) : null}
        </Marker>
    );
}

type Cluster = { key: string; center: LatLng; items: MapMarker[] };

function clusterIcon(count: number): L.DivIcon {
    const size = count < 10 ? 32 : count < 100 ? 38 : 44;
    return L.divIcon({
        html: `<span>${escapeHtml(formatNumber(count, 0))}</span>`,
        className:
            'flex items-center justify-center rounded-full border-2 border-white bg-brand text-xs font-semibold text-brand-foreground shadow-md',
        iconSize: [size, size],
    });
}

/** Grid clustering: groups markers whose projected pixels share a cell at the current zoom. */
function ClusteredMarkers({
    markers,
    threshold,
    onMarkerClick,
}: {
    markers: MapMarker[];
    threshold: number;
    onMarkerClick?: (marker: MapMarker) => void;
}) {
    const map = useMap();
    const [view, setView] = useState(() => ({
        zoom: map.getZoom(),
        bounds: map.getBounds(),
    }));

    useMapEvents({
        moveend: () =>
            setView({ zoom: map.getZoom(), bounds: map.getBounds() }),
    });

    const shouldCluster =
        markers.length > threshold && view.zoom < map.getMaxZoom();

    const clusters = useMemo<Cluster[]>(() => {
        if (!shouldCluster) {
            return [];
        }
        const visible = view.bounds.pad(0.25);
        const cells = new Map<string, MapMarker[]>();
        for (const marker of markers) {
            if (!visible.contains([marker.lat, marker.lng])) {
                continue;
            }
            const point = map.project([marker.lat, marker.lng], view.zoom);
            const key = `${Math.floor(point.x / CLUSTER_CELL_PX)}:${Math.floor(point.y / CLUSTER_CELL_PX)}`;
            const cell = cells.get(key);
            if (cell) {
                cell.push(marker);
            } else {
                cells.set(key, [marker]);
            }
        }
        return [...cells.entries()].map(([key, items]) => ({
            key,
            items,
            center: {
                lat:
                    items.reduce((sum, item) => sum + item.lat, 0) /
                    items.length,
                lng:
                    items.reduce((sum, item) => sum + item.lng, 0) /
                    items.length,
            },
        }));
    }, [map, markers, view, shouldCluster]);

    if (!shouldCluster) {
        return (
            <>
                {markers.map((marker) => (
                    <MarkerItem
                        key={marker.id}
                        marker={marker}
                        onClick={onMarkerClick}
                    />
                ))}
            </>
        );
    }

    return (
        <>
            {clusters.map((cluster) =>
                cluster.items.length === 1 ? (
                    <MarkerItem
                        key={cluster.items[0].id}
                        marker={cluster.items[0]}
                        onClick={onMarkerClick}
                    />
                ) : (
                    <Marker
                        key={`cluster-${cluster.key}`}
                        position={[cluster.center.lat, cluster.center.lng]}
                        icon={clusterIcon(cluster.items.length)}
                        title={t('ui.map.cluster', {
                            count: cluster.items.length,
                        })}
                        alt={t('ui.map.cluster', {
                            count: cluster.items.length,
                        })}
                        eventHandlers={{
                            click: () =>
                                map.fitBounds(
                                    L.latLngBounds(
                                        cluster.items.map(
                                            (item) =>
                                                [item.lat, item.lng] as [
                                                    number,
                                                    number,
                                                ],
                                        ),
                                    ),
                                    { padding: [48, 48] },
                                ),
                        }}
                    />
                ),
            )}
        </>
    );
}

type LocateState =
    | 'idle'
    | 'locating'
    | 'denied'
    | 'unavailable'
    | 'unsupported';

/**
 * "Use my location" control for a map (render it inside `MapView` / a react-leaflet map).
 * Geolocation is requested only when the button is pressed; denial shows a message instead of failing.
 */
export function UserLocationButton({
    onLocate,
    zoom = 14,
}: {
    onLocate?: (position: LatLng) => void;
    zoom?: number;
}) {
    const map = useMap();
    const containerRef = useRef<HTMLDivElement>(null);
    const [state, setState] = useState<LocateState>('idle');
    const [position, setPosition] = useState<LatLng | null>(null);

    useEffect(() => {
        const element = containerRef.current;
        if (element) {
            // Clicking the control must not click/pan the map underneath.
            L.DomEvent.disableClickPropagation(element);
            L.DomEvent.disableScrollPropagation(element);
        }
    }, []);

    const locate = () => {
        if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
            setState('unsupported');
            return;
        }
        setState('locating');
        navigator.geolocation.getCurrentPosition(
            (result) => {
                const next = {
                    lat: result.coords.latitude,
                    lng: result.coords.longitude,
                };
                setPosition(next);
                setState('idle');
                map.flyTo([next.lat, next.lng], Math.max(map.getZoom(), zoom));
                onLocate?.(next);
            },
            (error) =>
                setState(
                    error.code === error.PERMISSION_DENIED
                        ? 'denied'
                        : 'unavailable',
                ),
            { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
        );
    };

    const message =
        state === 'denied'
            ? t('ui.map.location_denied')
            : state === 'unavailable'
              ? t('ui.map.location_unavailable')
              : state === 'unsupported'
                ? t('ui.map.location_unsupported')
                : null;

    return (
        <>
            {position ? (
                <CircleMarker
                    center={[position.lat, position.lng]}
                    radius={8}
                    pathOptions={{
                        color: '#ffffff',
                        weight: 2,
                        fillColor: '#2563eb',
                        fillOpacity: 1,
                    }}
                >
                    <Tooltip>{t('ui.map.you_are_here')}</Tooltip>
                </CircleMarker>
            ) : null}
            <div
                ref={containerRef}
                className="absolute end-3 bottom-8 z-[1000] flex flex-col items-end gap-2"
            >
                {message ? (
                    <p
                        role="status"
                        className="max-w-56 rounded-md bg-background/95 px-3 py-2 text-xs text-foreground shadow-md"
                    >
                        {message}
                    </p>
                ) : null}
                <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="bg-background shadow-md"
                    onClick={locate}
                    disabled={state === 'locating'}
                    aria-label={
                        state === 'locating'
                            ? t('ui.map.locating')
                            : t('ui.map.locate')
                    }
                    title={t('ui.map.locate')}
                >
                    {state === 'locating' ? (
                        <Spinner />
                    ) : (
                        <LocateFixed className="size-4" aria-hidden="true" />
                    )}
                </Button>
            </div>
        </>
    );
}

export type MapViewProps = {
    markers?: MapMarker[];
    /** Initial center (defaults to `boot().map.default`, or the markers' extent when `fitMarkers`). */
    center?: LatLng;
    zoom?: number;
    /** Fit the first non-empty marker set into view (default: true when no `center` is given). */
    fitMarkers?: boolean;
    /** Viewport changes, debounced by 500 ms (also fired once for the initial viewport). */
    onBoundsChange?: (bounds: MapBounds) => void;
    onMarkerClick?: (marker: MapMarker) => void;
    /** Show the "use my location" button (default true). */
    showLocate?: boolean;
    onLocate?: (position: LatLng) => void;
    /** Marker count above which grid clustering is used (default 200). */
    clusterThreshold?: number;
    /** Accessible name of the map region. */
    label?: string;
    /** Size the map with a height utility, e.g. `h-96` (default `h-80`). */
    className?: string;
    /** Extra react-leaflet layers rendered inside the map. */
    children?: ReactNode;
};

/** Leaflet map with markers + popups, clustering, debounced bounds reporting and a graceful fallback. */
export function MapView({
    markers = [],
    center,
    zoom,
    fitMarkers,
    onBoundsChange,
    onMarkerClick,
    showLocate = true,
    onLocate,
    clusterThreshold = CLUSTER_THRESHOLD,
    label,
    className,
    children,
}: MapViewProps) {
    const config = boot().map;
    const [tilesFailed, setTilesFailed] = useState(false);
    const consecutiveFailures = useRef(0);
    const initialCenter = center ?? {
        lat: config.default.lat,
        lng: config.default.lng,
    };
    const shouldFit = fitMarkers ?? center === undefined;

    if (!mapConfigured() || tilesFailed) {
        return <MapUnavailable className={cn('h-80', className)} />;
    }

    return (
        <div
            role="region"
            aria-label={label ?? t('ui.map.region')}
            className={cn(
                'relative isolate h-80 overflow-hidden rounded-xl border',
                className,
            )}
            dir="ltr"
        >
            <MapContainer
                center={[initialCenter.lat, initialCenter.lng]}
                zoom={zoom ?? config.default.zoom}
                zoomControl={false}
                className="size-full"
                scrollWheelZoom
            >
                <TileLayer
                    url={config.tile_url}
                    attribution={attributionHtml()}
                    eventHandlers={{
                        tileload: () => {
                            consecutiveFailures.current = 0;
                        },
                        tileerror: () => {
                            consecutiveFailures.current += 1;
                            if (
                                consecutiveFailures.current >=
                                TILE_FAILURE_THRESHOLD
                            ) {
                                setTilesFailed(true);
                            }
                        },
                    }}
                />
                <ZoomControl
                    position={isRtl() ? 'topright' : 'topleft'}
                    zoomInTitle={t('ui.map.zoom_in')}
                    zoomOutTitle={t('ui.map.zoom_out')}
                />
                <MapI18n />
                {shouldFit ? <FitToMarkers markers={markers} /> : null}
                {onBoundsChange ? (
                    <BoundsReporter onChange={onBoundsChange} />
                ) : null}
                <ClusteredMarkers
                    markers={markers}
                    threshold={clusterThreshold}
                    onMarkerClick={onMarkerClick}
                />
                {showLocate ? <UserLocationButton onLocate={onLocate} /> : null}
                {children}
            </MapContainer>
        </div>
    );
}

export type GeocodeResult = { label: string; lat: number; lng: number };

export type AddressMapPickerProps = {
    value: LatLng | null;
    onChange: (value: LatLng) => void;
    /** Optional address search (call your server endpoint, which uses the configured MapProvider). */
    onGeocode?: (query: string) => Promise<GeocodeResult[]>;
    /** Zoom used when jumping to a chosen location (default 16). */
    zoom?: number;
    disabled?: boolean;
    /** Server validation errors for the coordinates. */
    errors?: { lat?: string | null; lng?: string | null };
    className?: string;
    /** Height utility for the map (default `h-72`). */
    mapClassName?: string;
};

function ClickToPlace({
    disabled,
    onPick,
}: {
    disabled: boolean;
    onPick: (value: LatLng) => void;
}) {
    useMapEvents({
        click: (event) => {
            if (!disabled) {
                onPick({
                    lat: roundCoordinate(event.latlng.lat),
                    lng: roundCoordinate(event.latlng.lng),
                });
            }
        },
    });
    return null;
}

function FlyTo({
    target,
    zoom,
}: {
    target: { position: LatLng; seq: number } | null;
    zoom: number;
}) {
    const map = useMap();
    useEffect(() => {
        if (target) {
            map.flyTo(
                [target.position.lat, target.position.lng],
                Math.max(map.getZoom(), zoom),
            );
        }
    }, [map, target, zoom]);
    return null;
}

function parseCoordinate(raw: string, limit: number): number | null {
    const value = Number(raw.trim().replace(',', '.'));
    if (
        raw.trim() === '' ||
        !Number.isFinite(value) ||
        Math.abs(value) > limit
    ) {
        return null;
    }
    return roundCoordinate(value);
}

/**
 * Location picker: draggable marker, click-to-place, numeric latitude/longitude inputs (the
 * keyboard-accessible path) and optional address search through `onGeocode`.
 */
export function AddressMapPicker({
    value,
    onChange,
    onGeocode,
    zoom = 16,
    disabled = false,
    errors,
    className,
    mapClassName,
}: AddressMapPickerProps) {
    const config = boot().map;
    const baseId = useId();
    const [tilesFailed, setTilesFailed] = useState(false);
    const consecutiveFailures = useRef(0);
    const [flyTarget, setFlyTarget] = useState<{
        position: LatLng;
        seq: number;
    } | null>(null);

    const [latDraft, setLatDraft] = useState(value ? String(value.lat) : '');
    const [lngDraft, setLngDraft] = useState(value ? String(value.lng) : '');
    const [seen, setSeen] = useState<LatLng | null>(value);
    const [coordinateError, setCoordinateError] = useState<string | null>(null);

    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState<GeocodeResult[] | null>(null);
    const [searchError, setSearchError] = useState<string | null>(null);

    // Adopt external value changes (marker drag, map click, parent reset) into the inputs.
    if (value?.lat !== seen?.lat || value?.lng !== seen?.lng) {
        setSeen(value);
        setLatDraft(value ? String(value.lat) : '');
        setLngDraft(value ? String(value.lng) : '');
        setCoordinateError(null);
    }

    const jumpTo = (position: LatLng) => {
        onChange(position);
        setFlyTarget((previous) => ({
            position,
            seq: (previous?.seq ?? 0) + 1,
        }));
    };

    const commitDrafts = (latRaw: string, lngRaw: string) => {
        const lat = parseCoordinate(latRaw, 90);
        const lng = parseCoordinate(lngRaw, 180);
        if (lat === null || lng === null) {
            setCoordinateError(
                latRaw.trim() === '' && lngRaw.trim() === ''
                    ? null
                    : t('ui.map.invalid_coordinates'),
            );
            return;
        }
        setCoordinateError(null);
        if (lat !== value?.lat || lng !== value?.lng) {
            jumpTo({ lat, lng });
        }
    };

    const runSearch = async () => {
        const text = query.trim();
        if (!onGeocode || text.length < 3 || searching) {
            return;
        }
        setSearching(true);
        setSearchError(null);
        try {
            setResults(await onGeocode(text));
        } catch {
            setResults(null);
            setSearchError(t('ui.map.geocode_failed'));
        } finally {
            setSearching(false);
        }
    };

    const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            // Never submit the surrounding form from the address search box.
            event.preventDefault();
            void runSearch();
        }
    };

    const center = value ?? {
        lat: config.default.lat,
        lng: config.default.lng,
    };
    const mapAvailable = mapConfigured() && !tilesFailed;
    const latId = `${baseId}-lat`;
    const lngId = `${baseId}-lng`;
    const searchId = `${baseId}-search`;
    const hintId = `${baseId}-hint`;

    return (
        <div
            className={cn('grid gap-3', className)}
            data-slot="address-map-picker"
        >
            {onGeocode ? (
                <div className="grid gap-2">
                    <Label htmlFor={searchId} className="sr-only">
                        {t('ui.map.search')}
                    </Label>
                    <div className="flex gap-2">
                        <Input
                            id={searchId}
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            onKeyDown={onSearchKeyDown}
                            placeholder={t('ui.map.search_placeholder')}
                            disabled={disabled}
                            autoComplete="street-address"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => void runSearch()}
                            disabled={
                                disabled || searching || query.trim().length < 3
                            }
                        >
                            {searching ? (
                                <Spinner />
                            ) : (
                                <Search className="size-4" aria-hidden="true" />
                            )}
                            <span className="sr-only sm:not-sr-only">
                                {searching
                                    ? t('ui.map.searching')
                                    : t('ui.map.search')}
                            </span>
                        </Button>
                    </div>
                    {searchError ? (
                        <p role="alert" className="text-sm text-danger">
                            {searchError}
                        </p>
                    ) : null}
                    {results !== null ? (
                        results.length === 0 ? (
                            <p
                                role="status"
                                className="text-sm text-muted-foreground"
                            >
                                {t('ui.map.no_results')}
                            </p>
                        ) : (
                            <ul
                                aria-label={t('ui.map.results')}
                                className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border p-1"
                            >
                                {results.map((result) => (
                                    <li
                                        key={`${result.lat},${result.lng},${result.label}`}
                                    >
                                        <button
                                            type="button"
                                            className="w-full rounded-md px-2 py-1.5 text-start text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
                                            onClick={() => {
                                                jumpTo({
                                                    lat: roundCoordinate(
                                                        result.lat,
                                                    ),
                                                    lng: roundCoordinate(
                                                        result.lng,
                                                    ),
                                                });
                                                setResults(null);
                                            }}
                                        >
                                            {result.label}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )
                    ) : null}
                </div>
            ) : null}

            {mapAvailable ? (
                <div
                    role="region"
                    aria-label={t('ui.map.region')}
                    aria-describedby={hintId}
                    className={cn(
                        'relative isolate h-72 overflow-hidden rounded-xl border',
                        mapClassName,
                    )}
                    dir="ltr"
                >
                    <MapContainer
                        center={[center.lat, center.lng]}
                        zoom={value ? zoom : config.default.zoom}
                        zoomControl={false}
                        className="size-full"
                        scrollWheelZoom
                    >
                        <TileLayer
                            url={config.tile_url}
                            attribution={attributionHtml()}
                            eventHandlers={{
                                tileload: () => {
                                    consecutiveFailures.current = 0;
                                },
                                tileerror: () => {
                                    consecutiveFailures.current += 1;
                                    if (
                                        consecutiveFailures.current >=
                                        TILE_FAILURE_THRESHOLD
                                    ) {
                                        setTilesFailed(true);
                                    }
                                },
                            }}
                        />
                        <ZoomControl
                            position={isRtl() ? 'topright' : 'topleft'}
                            zoomInTitle={t('ui.map.zoom_in')}
                            zoomOutTitle={t('ui.map.zoom_out')}
                        />
                        <MapI18n />
                        <ClickToPlace disabled={disabled} onPick={onChange} />
                        <FlyTo target={flyTarget} zoom={zoom} />
                        {value ? (
                            <Marker
                                position={[value.lat, value.lng]}
                                draggable={!disabled}
                                title={t('ui.map.selected_location')}
                                alt={t('ui.map.marker')}
                                eventHandlers={{
                                    dragend: (event) => {
                                        const position = (
                                            event.target as L.Marker
                                        ).getLatLng();
                                        onChange({
                                            lat: roundCoordinate(position.lat),
                                            lng: roundCoordinate(position.lng),
                                        });
                                    },
                                }}
                            />
                        ) : null}
                        <UserLocationButton
                            onLocate={(position) =>
                                jumpTo({
                                    lat: roundCoordinate(position.lat),
                                    lng: roundCoordinate(position.lng),
                                })
                            }
                            zoom={zoom}
                        />
                    </MapContainer>
                </div>
            ) : (
                <MapUnavailable className={cn('h-auto', mapClassName)} />
            )}

            <p id={hintId} className="text-xs text-muted-foreground">
                {t('ui.map.drag_hint')}
            </p>

            <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                    <Label htmlFor={latId}>{t('ui.map.latitude')}</Label>
                    <Input
                        id={latId}
                        inputMode="decimal"
                        dir="ltr"
                        className="code"
                        value={latDraft}
                        disabled={disabled}
                        aria-invalid={
                            errors?.lat || coordinateError ? true : undefined
                        }
                        onChange={(event) => setLatDraft(event.target.value)}
                        onBlur={() => commitDrafts(latDraft, lngDraft)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                commitDrafts(latDraft, lngDraft);
                            }
                        }}
                    />
                    {errors?.lat ? (
                        <p role="alert" className="text-sm text-danger">
                            {errors.lat}
                        </p>
                    ) : null}
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor={lngId}>{t('ui.map.longitude')}</Label>
                    <Input
                        id={lngId}
                        inputMode="decimal"
                        dir="ltr"
                        className="code"
                        value={lngDraft}
                        disabled={disabled}
                        aria-invalid={
                            errors?.lng || coordinateError ? true : undefined
                        }
                        onChange={(event) => setLngDraft(event.target.value)}
                        onBlur={() => commitDrafts(latDraft, lngDraft)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                commitDrafts(latDraft, lngDraft);
                            }
                        }}
                    />
                    {errors?.lng ? (
                        <p role="alert" className="text-sm text-danger">
                            {errors.lng}
                        </p>
                    ) : null}
                </div>
            </div>
            {coordinateError ? (
                <p role="alert" className="text-sm text-danger">
                    {coordinateError}
                </p>
            ) : null}
        </div>
    );
}
