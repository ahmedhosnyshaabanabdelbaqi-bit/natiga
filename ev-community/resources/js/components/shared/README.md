# Shared UI kit (`@/components/shared`)

This file is the contract between the UI kit and every module. Anything listed here is a stable
public API: props may gain optional fields, but existing ones are not renamed or removed without a
migration note in this file.

```tsx
import {
    DataTable,
    FiltersBar,
    PageHeader,
    StatusBadge,
} from '@/components/shared';
```

Individual files can also be imported directly (`@/components/shared/data-table`). Heavy
dependencies stay out of your bundle either way:

- `MapView`, `AddressMapPicker` and `UserLocationButton` from the barrel are lazy wrappers. Leaflet
  (JS + CSS) downloads only when a map renders. Import `@/components/shared/map` directly when the
  page is mostly a map.
- `QrScanner` loads `html5-qrcode` with a dynamic `import()` when it mounts.

## Rules every component follows

- **i18n**: every visible or announced string goes through `t()` (keys in `lang/{ar,en}/ui.php`, and
  `core.php` for generic words). You pass already-translated strings as props (`title`, `label`…).
- **RTL**: logical utilities only (`ms-/me-/ps-/pe-/start-/end-/text-start`); direction icons carry
  `rtl:rotate-180`. Technical values (codes, phone numbers, amounts, coordinates) render with
  `dir="ltr"`.
- **Accessibility**: every control has an accessible name, keyboard support and a visible
  `focus-visible` ring; decorative icons have `aria-hidden`; status changes use `role="status"` or
  `role="alert"`.
- **Server is the authority**: components never trust themselves for prices, permissions or
  validation. They display server data and server errors.
- **Types**: strict TypeScript, no `any`.

---

## Page structure

### `PageHeader`

| Prop          | Type             | Notes                                           |
| ------------- | ---------------- | ----------------------------------------------- |
| `title`       | `string`         | Rendered as the page `<h1>`.                    |
| `description` | `string \| null` | Optional.                                       |
| `actions`     | `ReactNode`      | Buttons at the inline end. They wrap on mobile. |
| `children`    | `ReactNode`      | Extra content under the title, such as badges.  |

```tsx
<PageHeader
    title={t('orders.title')}
    description={t('orders.subtitle')}
    actions={
        <Button asChild>
            <Link href={create()}>{t('core.actions.create')}</Link>
        </Button>
    }
/>
```

### `SectionCard` and `DescriptionList`

`SectionCard` props: `title`, `description`, `actions` (header end), `footer`, `flush` (no content
padding, for tables), `className`, `contentClassName`.

`DescriptionList` props: `items: DescriptionItem[]`, `columns?: 1 | 2`, `layout?: 'stacked' | 'inline'`.
`DescriptionItem` is `{ label, value, type?: 'text'|'code'|'money'|'date'|'datetime'|'relative', currency?, full?, hidden? }`.
Null or empty values render `—`.

```tsx
<SectionCard title={t('orders.details')}>
    <DescriptionList
        items={[
            {
                label: t('orders.number'),
                value: order.order_number,
                type: 'code',
            },
            {
                label: t('core.labels.total'),
                value: order.total_amount,
                type: 'money',
                currency: order.currency,
            },
            {
                label: t('core.labels.created_at'),
                value: order.created_at,
                type: 'datetime',
            },
        ]}
    />
</SectionCard>
```

### `StatCard` and `KpiGrid`

`StatCard`: `label`, `value: ReactNode`, `hint?`, `icon?: LucideIcon`, `href?` (makes the card a link), `tone?: 'default'|'brand'|'success'|'warning'|'danger'`.
`KpiGrid`: `kpis: Kpi[]`, the shape returned by `DashboardKpis` (`{ key, label, value, href, source, format: 'number'|'money'|'text', tone }`).

---

## Lists

### `DataTable<T>`

A server-driven table. Sorting (`sort`, `direction`), `per_page` and `page` live in the URL, and
the controller returns the rows. On small screens it renders as a card list.

| Prop                                                                                     | Type                                                                | Notes                                                                                                                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                                     | `string`                                                            | Required, stable. Namespaces the saved column visibility.                                                                                                   |
| `columns`                                                                                | `DataTableColumn<T>[]`                                              | `{ key, header, cell?, sortable?, sortKey?, align?: 'start' \| 'center' \| 'end', hideOnMobile?, defaultHidden?, required?, className?, headerClassName? }` |
| `data`                                                                                   | `Paginated<T> \| SimplePaginated<T> \| ResourcePaginated<T> \| T[]` | Any Laravel paginator JSON shape.                                                                                                                           |
| `rowKey`                                                                                 | `keyof T \| (row) => string \| number`                              | Use `public_id`.                                                                                                                                            |
| `rowHref` / `onRowClick`                                                                 |                                                                     | Makes rows keyboard-activatable (Enter/Space). Ctrl/Cmd or middle click opens a new tab.                                                                    |
| `selectable`, `bulkActions(selected, clear)`                                             |                                                                     | Selection is cleared when the data set changes.                                                                                                             |
| `filtered`, `onResetFilters`                                                             |                                                                     | With `filtered`, an empty result shows "No results + reset" instead of the empty state.                                                                     |
| `emptyTitle`, `emptyDescription`, `emptyAction`, `emptyState`                            |                                                                     | Empty state customisation.                                                                                                                                  |
| `toolbar`                                                                                | `ReactNode`                                                         | Usually a `FiltersBar`.                                                                                                                                     |
| `loading`                                                                                | `boolean`                                                           | Defaults to the in-flight Inertia GET for the current path.                                                                                                 |
| `caption`, `mobileTitle(row)`, `perPageOptions`, `columnToggle`, `dense`, `rowClassName` |                                                                     |                                                                                                                                                             |

```tsx
const columns: DataTableColumn<OrderRow>[] = [
    {
        key: 'order_number',
        header: t('orders.number'),
        sortable: true,
        required: true,
        cell: (o) => <Code>{o.order_number}</Code>,
    },
    {
        key: 'status',
        header: t('core.labels.status'),
        cell: (o) => <StatusBadge status={o.status} label={o.status_label} />,
    },
    {
        key: 'total_amount',
        header: t('core.labels.total'),
        align: 'end',
        cell: (o) => <Money amount={o.total_amount} currency={o.currency} />,
    },
];

<DataTable
    id="admin-orders"
    columns={columns}
    data={orders}
    rowKey="public_id"
    rowHref={(o) => show.url(o.public_id)}
    filtered={Object.keys(filters).length > 0}
    toolbar={<FiltersBar filters={filterDefs} />}
/>;
```

### `FiltersBar`, `useQueryState`

`FiltersBar` props: `filters: FilterDefinition[]`, `values?` (defaults to the URL), `onChange?`
(defaults to an Inertia GET with `page` reset), `children` (extra buttons at the inline end), `hideReset`.
`FilterDefinition` is `{ key, type: 'search'|'select'|'multiselect'|'date'|'daterange'|'boolean', label, placeholder?, options?, fromKey?, toKey?, className? }`.
Search is debounced by 400 ms. On mobile, the non-search filters move into a bottom drawer and are
applied together.

`useQueryState()` returns `{ path, query, get, getAll, href(changes), patch(changes, opts), set, remove, reset }`.
Arrays serialise as `key[]=a&key[]=b`.

```tsx
<FiltersBar
    filters={[
        { key: 'search', type: 'search', label: t('core.actions.search') },
        {
            key: 'status',
            type: 'select',
            label: t('core.labels.status'),
            options: statusOptions,
        },
        {
            key: 'created',
            type: 'daterange',
            label: t('core.labels.created_at'),
        },
    ]}
/>
```

### `Pagination`

Props: `data` (any paginator JSON or a `PaginationMeta`), `showSummary`, `siblings`, `only` (partial
reload props). It keeps the current query string. `normalizePaginated(data)` returns `{ rows, meta }`.

---

## States and feedback

| Component                                          | Props                                                                                               | Use                                                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `EmptyState`                                       | `icon?, title?, description?, action?`                                                              | A list or section with no data yet.                                     |
| `NoResults`                                        | `onReset?`                                                                                          | Filters matched nothing.                                                |
| `ErrorState`                                       | `kind?: 'error' \| 'permission' \| 'connection', title?, description?, onRetry?, action?`           | Load failures and permission denied.                                    |
| `InlineAlert`                                      | `tone?: 'info' \| 'warning' \| 'danger' \| 'success', title?, children, icon?, action?, onDismiss?` | Contextual notices inside pages or forms (not toasts).                  |
| `SkeletonTable` / `SkeletonCards` / `SkeletonForm` | `rows/columns`, `count`, `fields`                                                                   | Loading placeholders (announced to screen readers).                     |
| `StatusBanners`                                    | –                                                                                                   | Renders the shared `banners` prop. The portal layouts mount it already. |

---

## Forms

### `FormField` and `FormActions`

`FormField` props: `label`, `id?`, `required?`, `optional?`, `hint?`, `error?` (from Inertia
`errors`), `hideLabel?`, `inline?` (checkbox or switch rows), and `children`. `children` is either
a single control, which gets `id`, `aria-describedby`, `aria-invalid` and `aria-required`
injected, or a render function that receives those props.
`FormActions` props: `align?: 'start'|'end'|'between'`, `sticky?` (sticky bottom bar on mobile, default true).

```tsx
<FormField
    label={t('vehicles.fields.vin')}
    error={errors.vin}
    hint={t('vehicles.hints.vin')}
>
    <Input
        value={data.vin}
        onChange={(e) => setData('vin', e.target.value)}
        dir="ltr"
    />
</FormField>
```

### `FileUpload`

This is a controlled picker with drag and drop, image previews, remove buttons and client-side
type, size and count checks. It never uploads by itself. The server (`AttachmentService`) stays
the authority on MIME type and size.

| Prop                                                            | Type                                                                                   | Notes                                                             |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `multiple`                                                      | `false` (default) \| `true`                                                            | Selects the value type.                                           |
| `value` / `onChange`                                            | `File \| null` and `(file) => void`, or `File[]` and `(files) => void` when `multiple` | Controlled.                                                       |
| `accept`                                                        | `string`                                                                               | Same syntax as `<input accept>`: `image/*,application/pdf,.heic`. |
| `maxSizeMb`                                                     | `number`                                                                               | Checked per file, and shown as a hint.                            |
| `maxFiles`                                                      | `number`                                                                               | Multiple mode only.                                               |
| `error`                                                         | `string \| null`                                                                       | Omit it when a wrapping `FormField` already shows the error.      |
| `disabled`, `capture` (`'environment' \| 'user'`), `name`, `id` |                                                                                        | `FormField` injects `id` and the aria props.                      |

Upload pattern with Inertia `useForm`. Use `forceFormData` so files are sent as multipart even
through `put` or `patch`, which Inertia spoofs with `_method`:

```tsx
const form = useForm<{ amount: string; proof: File | null }>({
    amount: '',
    proof: null,
});

<FormField
    label={t('payments.fields.proof')}
    error={form.errors.proof}
    required
>
    <FileUpload
        value={form.data.proof}
        onChange={(file) => form.setData('proof', file)}
        accept="image/*,application/pdf"
        maxSizeMb={10}
    />
</FormField>;

form.post(store.url(), { forceFormData: true, onSuccess: () => form.reset() });
```

With several files, send `photos: File[]` and validate `photos.*` on the server. Laravel receives
`photos[0]`, `photos[1]` and so on.

### `ConfirmDialog`, `ConfirmProvider`, `useConfirm`

`ConfirmDialog` props: `open`, `onOpenChange`, `title`, `description?`, `confirmLabel?`,
`cancelLabel?`, `destructive?`, `requireReason?` (at least 5 characters, passed to `onConfirm(reason)`),
`reasonLabel?`, `reasonPlaceholder?`, `processing?`, `onConfirm(reason?)` (a returned promise shows
a spinner), `onCancel?`, `children?`. Sensitive actions must still validate `reason` on the server.

For imperative use, mount `<ConfirmProvider>` around the page, then:

```tsx
const confirm = useConfirm();
const { confirmed, reason } = await confirm({
    title: t('payments.reject_title'),
    destructive: true,
    requireReason: true,
});
if (confirmed) router.post(reject.url(payment.public_id), { reason });
```

### `Rating`

Props: `value`, `max?`, `onChange?` (makes it a keyboard radio group; arrow keys follow the text
direction), `readOnly?`, `size?`, `label?`, `name?` (hidden input), `showValue?`.

---

## Display

| Component       | Props                                                                                                  | Notes                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `StatusBadge`   | `status`, `label?`, `tone?`, `className?`                                                              | Always pass the translated `label` (enum `label()` from the server). `toneForStatus(status)` maps common vocabularies to tones. |
| `Money`         | `amount: string \| number \| null`, `currency?`, `muted?`                                              | Uses decimal strings from the server and formats with `formatMoney`, LTR.                                                       |
| `DateTime`      | `value`, `mode?: 'date' \| 'datetime' \| 'relative'`                                                   | Africa/Cairo. The title shows the absolute time.                                                                                |
| `Code`          | `children`                                                                                             | For technical identifiers (VIN, SKU, numbers), LTR monospace. Re-exported from `@/components/ui/code`.                          |
| `PhoneNumber`   | `value`, `whatsapp?`, `icon?`                                                                          | `tel:` link, LTR. `whatsapp` adds a `wa.me` link (Egyptian `0…` becomes `20…`).                                                 |
| `CopyButton`    | `value`, `label?`, `showLabel?`, `size?`, `variant?: 'default' \| 'ghost' \| 'outline' \| 'secondary'` | Confirms with a check icon and announces "Copied".                                                                              |
| `ProgressBar`   | `value`, `max?`, `label?`, `format?: 'percent' \| 'fraction' \| 'none'`, `hint?`, `tone?`, `size?`     | For group-buy quantities and capacity.                                                                                          |
| `StepIndicator` | `steps: {key,label,description?}[]`, `current` (key or index), `orientation?`, `completed?`            | Sets `aria-current="step"`.                                                                                                     |
| `Timeline`      | `items: {id?, title, description?, at, actor?, tone?, icon?}[]`, `dense?`, `absolute?`                 | For status history.                                                                                                             |
| `tone.ts`       | `Tone`, `toneText`, `toneSoft`, `toneSolid`, `toneBorder`, `isTone`                                    | Shared semantic colours.                                                                                                        |

---

## Navigation

### `CommandPalette`

A Ctrl/Cmd+K palette: cmdk inside a dialog, keyboard navigable (arrows, Enter, Escape).

| Prop                    | Type                                                                                | Notes                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `groups`                | `{ heading, items: { id?, label, hint?, icon?, keywords?, href \| onSelect }[] }[]` | Static entries, filtered locally. Matching ignores case and Arabic diacritics.  |
| `search`                | `(query, signal: AbortSignal) => Promise<CommandPaletteGroup[]>`                    | Optional server search. Debounced by 250 ms, and previous requests are aborted. |
| `minSearchLength`       | `number`                                                                            | Default 2.                                                                      |
| `open` / `onOpenChange` |                                                                                     | Optional controlled mode.                                                       |
| `shortcut`              | `boolean`                                                                           | Default true (global Ctrl/Cmd+K). Mount one palette per page.                   |
| `trigger`               | `boolean`                                                                           | Default true. Renders a "Search ⌘K" button.                                     |

```tsx
<CommandPalette
    groups={[
        {
            heading: t('core.nav.orders'),
            items: [
                {
                    label: t('orders.title'),
                    href: '/admin/orders',
                    icon: Package,
                },
            ],
        },
    ]}
    search={async (q, signal) => {
        const res = await fetch(`/admin/search?q=${encodeURIComponent(q)}`, {
            signal,
            headers: { Accept: 'application/json' },
        });
        return (await res.json()).groups;
    }}
/>
```

The search endpoint must enforce permissions itself and must only return records the user may see.

### `LanguageSwitcher`

Props: `variant?`, `className?`. It posts to `/locale`, and the server keeps the current path.

---

## Devices

### `QrScanner`

The scanner uses the rear camera by default (`facingMode: 'environment'`, which also works on iOS
Safari). It has a camera switcher when several cameras exist, a torch toggle when the track
supports it, and start and stop camera controls. A manual code entry fallback is always
available. Camera access needs HTTPS (or localhost). Denied permission, insecure contexts and
missing cameras show a translated message, and the manual entry still works.

| Prop                                 | Type                     | Notes                                                                |
| ------------------------------------ | ------------------------ | -------------------------------------------------------------------- |
| `onScan`                             | `(text: string) => void` | The same code is not emitted again within `dedupeMs` (default 3000). |
| `paused`                             | `boolean`                | Freezes decoding while you process a result. The camera stays on.    |
| `manualEntry`                        | `boolean`                | Default true. Manual submissions are always emitted.                 |
| `dedupeMs`, `autoStart`, `className` |                          |                                                                      |

```tsx
const [busy, setBusy] = useState(false);
<QrScanner
    paused={busy}
    onScan={(code) => {
        setBusy(true);
        router.post(lookup.url(), { code }, { onFinish: () => setBusy(false) });
    }}
/>;
```

A scanned value is untrusted input. Resolve it on the server, which checks the signature and
expiry, and make the follow-up action idempotent.

### `MapView`, `UserLocationButton`

Tiles come from `boot().map.tile_url` (server `MAP_TILE_URL`). If `MAP_PROVIDER=none`, or 8 tiles
in a row fail to load, the map is replaced by `t('core.states.map_unavailable')`. Always offer a
list or manual search next to a map.

| Prop                                                                                   | Type                                                      | Notes                                                                                                                |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `markers`                                                                              | `{ id, lat, lng, title?, popup?: ReactNode }[]`           | Popups render in the page direction.                                                                                 |
| `center`, `zoom`                                                                       |                                                           | Initial view only (defaults to `boot().map.default`).                                                                |
| `fitMarkers`                                                                           | `boolean`                                                 | Fits the first non-empty marker set once. Later reloads never move the map. Default: true when no `center` is given. |
| `onBoundsChange`                                                                       | `(b: { north, south, east, west, zoom, center }) => void` | Debounced by 500 ms, and also fired for the initial view. Use it to load "stations in view".                         |
| `onMarkerClick`                                                                        | `(marker) => void`                                        |                                                                                                                      |
| `clusterThreshold`                                                                     | `number`                                                  | Default 200. Above it, markers are grid-clustered, and clicking a cluster zooms into it.                             |
| `showLocate`, `onLocate`                                                               |                                                           | "Use my location" button (default shown). Geolocation is requested only on click. Denial shows a message.            |
| `label`, `className` (height, default `h-80`), `children` (extra react-leaflet layers) |                                                           |                                                                                                                      |

```tsx
<MapView
    className="h-[28rem]"
    markers={stations.map((s) => ({
        id: s.public_id,
        lat: s.latitude,
        lng: s.longitude,
        title: s.name,
        popup: <StationPopup station={s} />,
    }))}
    onBoundsChange={(b) =>
        router.reload({
            only: ['stations'],
            data: { bounds: [b.south, b.west, b.north, b.east].join(',') },
        })
    }
/>
```

`UserLocationButton` (`{ onLocate?, zoom? }`) is already inside `MapView`. Render it yourself only
inside a custom react-leaflet `MapContainer`.

### `AddressMapPicker`

Props: `value: {lat,lng} | null`, `onChange`, `onGeocode?: (query) => Promise<{label,lat,lng}[]>`,
`zoom?` (default 16), `disabled?`, `errors?: { lat?, lng? }`, `className?`, `mapClassName?`.
Users can set the location by dragging the marker, clicking the map, typing latitude and longitude
(the keyboard-accessible path, validated to ±90 and ±180, rounded to 6 decimals) or picking an
address search result. `onGeocode` must call your own server endpoint, which uses the configured
`MapProvider`. Never call a geocoder directly from the browser.

```tsx
<AddressMapPicker
    value={data.location}
    onChange={(v) => setData('location', v)}
    errors={{ lat: errors['location.lat'], lng: errors['location.lng'] }}
    onGeocode={async (q) =>
        (
            await fetch(`/account/geocode?q=${encodeURIComponent(q)}`, {
                headers: { Accept: 'application/json' },
            }).then((r) => r.json())
        ).results
    }
/>
```

---

## `@/components/ui` notes

These are shadcn primitives (Radix), localised and RTL-safe: accordion, alert, alert-dialog,
avatar, badge, breadcrumb, button, card, checkbox, code, collapsible, command, date-input, dialog,
drawer, dropdown-menu, empty, field, hover-card, icon, input, input-otp, kbd, label,
navigation-menu, pagination, popover, progress, radio-group, scroll-area, select, separator, sheet,
sidebar, skeleton, slider, sonner, spinner, switch, table, tabs, textarea, toggle, toggle-group,
tooltip.

- `SheetContent side` also accepts the logical values `'start'` and `'end'`. The default is
  `'end'`, which is the right edge in English and the left edge in Arabic.
- `DialogContent` takes `showCloseButton?: boolean` (default true).
- `CommandDialog` takes `commandProps` for the cmdk root, for example `{ shouldFilter: false }`
  with server search.
- `InputOTP` always renders left to right (codes are digits).

## Hooks (`@/hooks`)

| Hook                                                        | Returns                                                                                                              |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `useClipboard()`                                            | `[copiedText, copy(text) => Promise<boolean>]`. Resolves `false` when the clipboard is unavailable.                  |
| `useAppearance()`                                           | `{ appearance, resolvedAppearance, updateAppearance }` (light, dark or system; stored in localStorage and a cookie). |
| `useIsMobile()`                                             | `boolean` (< 768 px).                                                                                                |
| `useCurrentUrl()`                                           | `{ currentUrl, isCurrentUrl, isCurrentOrParentUrl, whenCurrentUrl }`.                                                |
| `useTwoFactorAuth()`                                        | Fortify 2FA setup data plus translated errors.                                                                       |
| `usePasskeyErrorMessage(errorInstance)`                     | Translated message for `@laravel/passkeys` errors.                                                                   |
| `useInitials()`, `useMobileNavigation()`, `useFlashToast()` | Small helpers used by the layouts.                                                                                   |
