/**
 * Shared UI kit barrel. Every component is documented in ./README.md (the contract for all modules).
 *
 * Heavy dependencies stay out of the initial bundle: the map components exported here are lazy
 * wrappers (Leaflet loads on first render) and QrScanner imports html5-qrcode on mount.
 */
export { CommandPalette, COMMAND_SEARCH_DEBOUNCE_MS } from './command-palette';
export type {
    CommandPaletteGroup,
    CommandPaletteItem,
    CommandPaletteProps,
} from './command-palette';
export {
    CONFIRM_REASON_MIN_LENGTH,
    ConfirmDialog,
    ConfirmProvider,
    useConfirm,
} from './confirm-dialog';
export type {
    ConfirmDialogProps,
    ConfirmOptions,
    ConfirmResult,
} from './confirm-dialog';
export { CopyButton } from './copy-button';
export { DataTable, useInertiaLoading } from './data-table';
export type { DataTableColumn, DataTableProps, RowKey } from './data-table';
export { DateTime } from './date-time';
export { EmptyState, NoResults } from './empty-state';
export { ErrorState } from './error-state';
export { fileMatchesAccept, FileUpload } from './file-upload';
export type { FileUploadProps } from './file-upload';
export {
    filterKeys,
    FiltersBar,
    isFilterActive,
    SEARCH_DEBOUNCE_MS,
} from './filters-bar';
export type {
    FilterDefinition,
    FilterOption,
    FilterType,
    FilterValues,
} from './filters-bar';
export { FormActions, FormField } from './form-field';
export type { FormFieldControlProps } from './form-field';
export { InlineAlert } from './inline-alert';
export type { InlineAlertTone } from './inline-alert';
export { KpiGrid } from './kpi-grid';
export type { Kpi } from './kpi-grid';
export { LanguageSwitcher } from './language-switcher';
export { AddressMapPicker, MapView, UserLocationButton } from './map-lazy';
export type {
    AddressMapPickerProps,
    GeocodeResult,
    LatLng,
    MapBounds,
    MapMarker,
    MapViewProps,
} from './map';
export { Money } from './money';
export { PageHeader } from './page-header';
export { normalizePaginated, Pagination } from './pagination';
export type { AnyPaginated, PaginationMeta } from './pagination';
export { PhoneNumber } from './phone-number';
export { ProgressBar } from './progress-bar';
export { QR_DEDUPE_MS, QrScanner } from './qr-scanner';
export type { QrScannerProps } from './qr-scanner';
export { Rating } from './rating';
export { DescriptionList, SectionCard } from './section-card';
export type { DescriptionItem } from './section-card';
export { SkeletonCards, SkeletonForm, SkeletonTable } from './skeletons';
export { StatCard } from './stat-card';
export { StatusBadge, toneForStatus } from './status-badge';
export type { StatusTone } from './status-badge';
export { StatusBanners } from './status-banners';
export { StepIndicator } from './step-indicator';
export type { Step } from './step-indicator';
export { Timeline } from './timeline';
export type { TimelineItem } from './timeline';
export {
    isTone,
    toneBorder,
    tones,
    toneSoft,
    toneSolid,
    toneText,
} from './tone';
export type { Tone } from './tone';
export { buildQuery, parseQuery, useQueryState } from './use-query-state';
export type {
    QueryNavigateOptions,
    QueryRecord,
    QueryState,
    QueryValue,
} from './use-query-state';
export { Code } from '@/components/ui/code';
