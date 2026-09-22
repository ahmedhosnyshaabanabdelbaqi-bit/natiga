# Vehicles & My Garage

Modules `vehicles` (master data, member vehicles, public selector) and `garage` (the member's garage UI and
its extension registries). Both are **core** modules (they cannot be disabled).

Code: `app/Modules/Vehicles/**`, `app/Modules/Garage/**` · Pages: `resources/js/pages/{admin/vehicles,admin/garage,member/garage,public/vehicles}` ·
Frontend features: `resources/js/features/{vehicles,garage}` · Translations: `lang/{ar,en}/{vehicles,garage}.php`.

---

## 1. Data model

| Table | Model | Notes |
|---|---|---|
| `vehicle_makes` | `VehicleMake` | `slug` (unique), `name_ar`, `name_en`, `logo_path` (public disk, stored through `AttachmentService`), `country_code`, `is_active`, `sort_order` |
| `vehicle_models` | `VehicleModel` | `vehicle_make_id`, `slug` (unique per make), `model_code`, `body_type`, `is_active` |
| `vehicle_variants` | `VehicleVariant` | `vehicle_model_id`, `trim`, `market_version` (china/europe/gulf/egypt/other/unknown), `year_from`, `year_to` (null = still produced), `battery_variant_id`, `ac_connector_type_id`, `dc_connector_type_id`, `battery_capacity_kwh`, `motor_kw`, `range_km_wltp`, `notes`. `charging_port_connector_type_id` is a read alias of the AC connector (DOMAIN_CONTRACTS). |
| `battery_variants` | `BatteryVariant` | `name` (unique), `capacity_kwh`, `chemistry` (LFP/NMC/NCA/other) |
| `connector_types` | `ConnectorType` | `code` (type2, ccs2, chademo, gbt_ac, gbt_dc, nacs …), `current_type` ac/dc |
| `connector_compatibility_rules` | `ConnectorCompatibilityRule` | vehicle connector × station connector → `direct` / `adapter` / `incompatible`, `adapter_name`, `notes`, `verified_by`, `verified_at` |
| `member_vehicles` | `MemberVehicle` | ULID `public_id`; `vin` (Laravel `encrypted` cast, never serialized), `vin_hash` (sha256 of the normalized VIN), `status` active/sold/archived, `is_primary`, `odometer_km`, `image_attachment_id` (private attachment) |
| `vehicle_odometer_history` | `VehicleOdometerEntry` | append-only readings: `odometer_km`, `source` manual/service_record/import, `recorded_at`, `note`, `created_by` |

Database guarantees (PostgreSQL):
- at most **one primary vehicle per member** — partial unique index `member_vehicles_one_primary_per_user`;
- a VIN is registered on at most **one ACTIVE vehicle** — partial unique index `member_vehicles_active_vin_unique` on `vin_hash`
  (sold/archived copies are kept for history; the new owner can register the VIN);
- check constraints on statuses, market versions, years (2008–2035) and capacities.

`User::vehicles()` and `User::primaryVehicle()` are added with `resolveRelationUsing` (VehiclesServiceProvider).

### `MemberVehicle` API (binding for other modules)

```php
MemberVehicle::query()->forUser($user)->active()->primary();   // scopes
$vehicle->displayName();                                        // "BYD Atto 3 2023 (nickname)", current locale
$vehicle->isOwnedBy($user);
$vehicle->connectorTypeIds();                                   // ['ac' => ?int, 'dc' => ?int] from the variant
$vehicle->compatibleStationConnectorTypeIds();                  // ['direct' => int[], 'adapter' => int[]]
$vehicle->connectorCompatibility();                             // + 'incompatible' => int[] and rule details
$vehicle->batteryCapacityKwh();                                 // explicit battery pack, else the variant figure
$vehicle->maskedVin();                                          // "*************3456"
MemberVehicle::hashVin($vin); MemberVehicle::normalizeVin($vin); MemberVehicle::isValidVin($vin);
```

Charging stations: a station connector id that is neither in `direct` nor `adapter` is **not usable**; ids absent
from every list are *unknown* and must never be shown as compatible. Same-type pairs without an explicit rule are
direct; when the AC and DC inlets give different answers for one station connector the best one wins
(direct > adapter > incompatible).

Odometer from other modules (service records, imports):

```php
app(UpdateOdometer::class)->execute($vehicle, $actor, 48200, reason: null, source: OdometerSource::ServiceRecord, recordedAt: $serviceDate);
```
A past `recordedAt` backfills history and only becomes the current reading when it is not older than the current one.
A new *current* reading lower than the previous one requires a reason (≥ 5 chars). Members can only record readings
for active vehicles; other sources may backfill any vehicle.

---

## 2. Member flows (`/account/garage`, owner-only)

| Flow | Rules |
|---|---|
| Add vehicle (wizard `/account/garage/create`) | make → model → variant or "I don't know" → year (required, narrowed to the variant's years) → market version (pre-filled from the variant) → battery (pre-filled) → optional first odometer reading → optional VIN → nickname / colour / plate hint (last 3 chars) → optional photo (JPEG/PNG/WebP ≤ `files.max_image_mb`, private attachment). New selections must be **active** master data. The first active vehicle becomes primary. |
| VIN | 17 chars, letters/digits, no I/O/Q; normalized (upper-case, spaces/dashes removed); stored encrypted + sha256 hash. An exact duplicate across **active** vehicles is refused with `vehicles.errors.vin_duplicate` and the UI offers "contact support". Staff resolve disputes by clearing the VIN (see §3). |
| Reveal VIN | `POST /account/garage/{vehicle}/vin/reveal` → JSON, owner only, `throttle:vin-reveal` (10/min), audited `vehicles.vin_revealed` (last 4 only), `Cache-Control: no-store`. The VIN lives in component state only. |
| Edit | Same rules; the vehicle's current make/model/variant stay valid even if deactivated since. The VIN is only touched when submitted (`keep` / `replace` / `remove` in the UI). Photo replace/remove deletes the old attachment **after commit**. Odometer is not edited here. |
| Status | active ⇄ sold ⇄ archived (optional note). A sold/archived vehicle loses the primary flag and the most recently added active vehicle is promoted. Re-activation re-checks the VIN against the other active vehicles. |
| Primary | only active vehicles; serialized per member (`pg_advisory_xact_lock`) and idempotent. |
| Delete | only **archived** vehicles, and only when every `VehicleDeletionGuards` guard allows it (re-checked inside the delete transaction). Odometer history and the photo are removed; the deletion is audited. |

Vehicle page `/account/garage/{vehicle}`: header (photo, name, status, primary, odometer + update dialog) and a tab list
built from `GarageSections` (see §5). `?tab=<key>` selects the tab.

Staff who are also members can only use the member garage on **their own** vehicles (`viewOwn` policy ability);
staff browse member vehicles in the admin panel.

---

## 3. Admin (`/admin/vehicles`, `/admin/garage`)

| Page | Permission | What |
|---|---|---|
| `/admin/vehicles` (makes), `/models`, `/variants` (+ battery packs), `/connectors` (+ compatibility matrix) | read: `vehicles.view` or `vehicles.manage_master`; write: `vehicles.manage_master` | CRUD, activate/deactivate, delete only when unreferenced (`vehicles.errors.in_use`). A model/variant used by member vehicles cannot be moved under another make/model. Every change is audited `vehicles.master_changed` and flushes the public catalog cache. |
| Compatibility matrix | `vehicles.manage_master` | Rows = vehicle connector, columns = station connector. Every saved cell (changed or just confirmed) records `verified_by` / `verified_at`. |
| `/admin/vehicles/members` | `vehicles.view` | Paginated list; search by member number / name / e-mail; filters make, model, status, "without variant". **VINs are never listed.** VIN lookup = `POST …/vin-lookup` (hash only, flashed for one request, `throttle:vin-lookup`, audited `vehicles.vin_lookup` with the match count only). |
| `/admin/vehicles/members/{vehicle}` | `vehicles.view` | Read-only detail (masked VIN, specs, odometer history with who recorded each reading). |
| `PUT /admin/vehicles/members/{vehicle}` | `vehicles.view` + `vehicles.edit_member_vehicle` | Staff correction: classification, market version, battery, status, clear a disputed VIN. Reason (≥ 5 chars) required; audited `vehicles.corrected_by_staff` (+ `vehicles.status_changed`). Staff never see or type the VIN. |
| `/admin/garage` | `vehicles.view` | Live aggregations: totals (active/sold/archived/without variant/without VIN/with odometer/members with a vehicle), top-20 models, by make, by model year. Every figure links to the filtered member-vehicle list. |

Master-data rows are addressed by their numeric id in admin URLs (admin-only, non-personal data); member vehicles
are always addressed by ULID `public_id`.

Dashboard KPI: `vehicles_total` (active member vehicles, permission `vehicles.view`).

---

## 4. Public vehicle selector

| Route | Name | Notes |
|---|---|---|
| `GET /{locale}/vehicles` | `public.vehicles.index` | Supported makes/models page (indexable). |
| `GET /{locale}/vehicles/data` | `public.vehicles.data` | Localized ACTIVE makes → models → variants + connector types, battery packs, market versions and year bounds. Cached server-side **1 h per locale** (`VehicleDataService::cacheKey()`), flushed by every master-data change; `Cache-Control: public, max-age=300`; `throttle:vehicle-data`. |
| `POST /{locale}/vehicles/select` | `public.vehicles.select` | Stores `{make_id, model_id, variant_id?, year?}` in the session (guests, or members without a garage vehicle). Inertia → redirect back; JSON → `{data: selectedVehicle}`. `throttle:vehicle-select`. |
| `DELETE /{locale}/vehicles/select` | `public.vehicles.deselect` | Clears the session selection. |
| `GET /{locale}/vehicles/selected` | `public.vehicles.selected` | JSON of the current selection. |

### Shared prop `selectedVehicle`

Every Inertia response of the public site and the member portal carries `selectedVehicle`
(`App\Modules\Vehicles\Services\SelectedVehicle::current()`): the member's **primary active garage vehicle**
(`source: 'garage'`, `vehicle_id` = public_id), otherwise the session pick (`source: 'session'`, `vehicle_id: null`),
otherwise `null`. It is not computed in the admin/partner panels.

```ts
type SelectedVehicle = { source: 'garage' | 'session'; vehicle_id: string | null; make_id: number; model_id: number;
  variant_id: number | null; year: number | null; make_name: string; model_name: string; variant_name: string | null; display_name: string };
```

Frontend (`@/features/vehicles`):

```tsx
import { VehicleSelector, useSelectedVehicle, useVehicleCatalog, VehiclePicker } from '@/features/vehicles';

const { vehicle, fromGarage, choose, clear } = useSelectedVehicle(); // backed by the shared prop, never localStorage
<VehicleSelector />                     // card with "select / change / clear"; members with a garage vehicle get "Manage in My Garage"
<VehicleSelector variant="compact" />   // one-line toolbar version
```
Server side, read the same selection with `SelectedVehicle::current($request)`.

---

## 5. Extension registries (for other modules)

### `GarageSections` — tabs of the vehicle page

Register in your ServiceProvider `boot()`:

```php
use App\Modules\Garage\Services\GarageSections;

GarageSections::register(
    'orders',                                      // key: snake_case, also the React file name
    'orders.garage.section_title',                 // translation key of the tab label
    fn (MemberVehicle $vehicle, User $user): ?array => [...],   // data for the component (null = "nothing to show")
    module: 'orders',                              // tab hidden while the module is disabled
    order: 40,                                     // core tabs: info 10, odometer 20, charging_compatibility 30
    permission: null,                              // optional permission the viewer must hold
);
```

- The resolver runs **lazily**: each section is an Inertia *optional* prop `section_<key>` fetched with a partial reload
  the first time its tab is shown. Exceptions are reported and rendered as an error state with retry (never a broken page).
- Scope everything you return to `$vehicle` (the owner is already authorized); never return other members' data.
- Frontend: create `resources/js/features/garage/sections/<key>.tsx` with a **default export** receiving
  `GarageSectionProps<YourData>` (`data`, `vehicle`, `canUpdate`) from `@/features/garage/types`. It is discovered by file
  name (`import.meta.glob`) and code-split. A registered key without a component renders the generic fallback empty state.

### `VehicleDeletionGuards` — block deleting a vehicle that has linked records

```php
use App\Modules\Garage\Services\VehicleDeletionGuards;

VehicleDeletionGuards::register(fn (MemberVehicle $v): ?string =>
    OrderItem::query()->where('member_vehicle_id', $v->id)->exists() ? __('orders.garage.vehicle_has_orders') : null);
// or with a key (re-registering replaces): VehicleDeletionGuards::register('orders', fn (...) => ...);
```
Return a translated reason to block, `null` to allow. The member sees the reason on the vehicle page.
Also reference `member_vehicles.id` with `restrictOnDelete()` foreign keys.

---

## 6. Permissions

| Key | Default roles | Grants |
|---|---|---|
| `vehicles.view` | support-agent, maintenance-manager, operations-manager, charging-content-manager | read master data, member vehicles (never VINs), garage overview, vehicle photos |
| `vehicles.manage_master` | content-manager, operations-manager | create/edit/(de)activate/delete makes, models, variants, battery packs, connector types, compatibility matrix |
| `vehicles.edit_member_vehicle` | operations-manager | staff correction of a member vehicle (with `vehicles.view`) |

Routes use `permission:` middleware **and** the `MemberVehiclePolicy` / FormRequest `authorize()` (defence in depth).

## 7. Audit actions

`vehicles.created`, `vehicles.updated`, `vehicles.status_changed`, `vehicles.primary_changed`, `vehicles.odometer_updated`,
`vehicles.deleted`, `vehicles.vin_revealed`, `vehicles.vin_lookup`, `vehicles.corrected_by_staff`, `vehicles.master_changed`.
VINs and VIN hashes never appear in audit values (only `has_vin` / `vin_changed` / last 4 on reveal).

## 8. Master data seeder

`database/seeders/Vehicles/VehiclesMasterSeeder.php` (auto-called by `MasterDataSeeder`): 6 connector types, the
compatibility rules (same type direct; type2⇄gbt_ac adapter; ccs2⇄gbt_dc incompatible; chademo⇄ccs2 incompatible;
nacs⇄ccs2 adapter), battery packs and ~23 makes / ~70 models / ~140 variants common in Egypt with market versions
(China = GB/T AC + DC; Europe/Gulf/Egypt = Type 2 + CCS2; Leaf = Type 2 + CHAdeMO; US Tesla = NACS). Every variant carries
the note "approximate public spec; verify". Idempotent: descriptive columns are refreshed with `updateOrCreate`
semantics, but `is_active`, `sort_order`, logos and existing (possibly staff-verified) compatibility rules are never overwritten.
It never creates member data.

## 9. Tests

`tests/Feature/Vehicles`, `tests/Feature/Garage`, `tests/Unit/Vehicles` — run
`DB_DATABASE=ev_test_6 php artisan test tests/Feature/Vehicles tests/Feature/Garage tests/Unit/Vehicles`.
