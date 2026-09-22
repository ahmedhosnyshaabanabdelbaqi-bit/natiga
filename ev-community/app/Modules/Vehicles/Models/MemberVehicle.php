<?php

namespace App\Modules\Vehicles\Models;

use App\Models\User;
use App\Modules\Files\Concerns\HasAttachmentsTrait;
use App\Modules\Files\Contracts\HasAttachments;
use App\Modules\Files\Models\Attachment;
use App\Modules\Garage\Services\VehicleDeletionGuards;
use App\Modules\Members\Models\Membership;
use App\Modules\Vehicles\Models\Enums\MarketVersion;
use App\Modules\Vehicles\Models\Enums\VehicleStatus;
use App\Support\Concerns\HasPublicId;
use Carbon\CarbonInterface;
use Database\Factories\Vehicles\MemberVehicleFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

/**
 * A vehicle in a member's garage.
 *
 * VIN is encrypted at rest (`encrypted` cast) and hidden from serialization; `vin_hash` (sha256 of the
 * normalized VIN, see `hashVin()`) is used for duplicate detection / lookups without decrypting.
 *
 * @property int $id
 * @property string $public_id
 * @property int $user_id
 * @property int $membership_id
 * @property int $vehicle_make_id
 * @property int $vehicle_model_id
 * @property int|null $vehicle_variant_id
 * @property int $year
 * @property MarketVersion $market_version
 * @property int|null $battery_variant_id
 * @property string|null $vin
 * @property string|null $vin_hash
 * @property string|null $nickname
 * @property int|null $image_attachment_id
 * @property string|null $image_path
 * @property string|null $color
 * @property string|null $plate_hint
 * @property int|null $odometer_km
 * @property CarbonInterface|null $odometer_updated_at
 * @property VehicleStatus $status
 * @property bool $is_primary
 * @property-read User $user
 * @property-read Membership $membership
 * @property-read VehicleMake $make
 * @property-read VehicleModel $model
 * @property-read VehicleVariant|null $variant
 * @property-read BatteryVariant|null $battery
 */
class MemberVehicle extends Model implements HasAttachments
{
    /** @use HasFactory<MemberVehicleFactory> */
    use HasAttachmentsTrait, HasFactory, HasPublicId;

    public const IMAGE_COLLECTION = 'vehicle_image';

    public const VIN_PATTERN = '/^[A-HJ-NPR-Z0-9]{17}$/';

    protected $guarded = [];

    /** Never serialize the VIN (even encrypted) or its hash by accident. */
    protected $hidden = ['vin', 'vin_hash'];

    protected function casts(): array
    {
        return [
            'vin' => 'encrypted',
            'year' => 'integer',
            'market_version' => MarketVersion::class,
            'status' => VehicleStatus::class,
            'is_primary' => 'boolean',
            'odometer_km' => 'integer',
            'odometer_updated_at' => 'datetime',
        ];
    }

    protected static function newFactory(): MemberVehicleFactory
    {
        return MemberVehicleFactory::new();
    }

    protected static function booted(): void
    {
        // Keep vin_hash in sync with the VIN, whatever code path writes it.
        static::saving(function (MemberVehicle $vehicle) {
            if ($vehicle->isDirty('vin')) {
                $vin = $vehicle->vin;
                $vehicle->vin_hash = $vin ? self::hashVin($vin) : null;
            }
        });
    }

    // ---- Relations -------------------------------------------------------------------------

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function membership(): BelongsTo
    {
        return $this->belongsTo(Membership::class);
    }

    public function make(): BelongsTo
    {
        return $this->belongsTo(VehicleMake::class, 'vehicle_make_id');
    }

    public function model(): BelongsTo
    {
        return $this->belongsTo(VehicleModel::class, 'vehicle_model_id');
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(VehicleVariant::class, 'vehicle_variant_id');
    }

    public function battery(): BelongsTo
    {
        return $this->belongsTo(BatteryVariant::class, 'battery_variant_id');
    }

    public function image(): BelongsTo
    {
        return $this->belongsTo(Attachment::class, 'image_attachment_id');
    }

    public function odometerHistory(): HasMany
    {
        return $this->hasMany(VehicleOdometerEntry::class, 'member_vehicle_id')->orderByDesc('recorded_at')->orderByDesc('id');
    }

    // ---- Scopes ----------------------------------------------------------------------------

    public function scopeForUser(Builder $query, User $user): Builder
    {
        return $query->where('user_id', $user->id);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', VehicleStatus::Active->value);
    }

    public function scopePrimary(Builder $query): Builder
    {
        return $query->where('is_primary', true);
    }

    public function scopeWithVinHash(Builder $query, string $vin): Builder
    {
        return $query->where('vin_hash', self::hashVin($vin));
    }

    // ---- Domain helpers ----------------------------------------------------------------------

    public function isOwnedBy(User $user): bool
    {
        return (int) $this->user_id === (int) $user->id;
    }

    public function isActive(): bool
    {
        return $this->status === VehicleStatus::Active;
    }

    /** "Make Model Year (nickname)" in the given locale. */
    public function displayName(?string $locale = null): string
    {
        $locale ??= app()->getLocale();
        $make = $this->relationLoaded('make') ? $this->make : $this->make()->first();
        $model = $this->relationLoaded('model') ? $this->model : $this->model()->first();
        $name = trim(($make?->name($locale) ?? '').' '.($model?->name($locale) ?? '').' '.$this->year);
        if ($this->nickname) {
            $name .= ' ('.$this->nickname.')';
        }

        return $name;
    }

    /**
     * Connector type ids from the variant (ac/dc), null when unknown.
     *
     * @return array{ac: ?int, dc: ?int}
     */
    public function connectorTypeIds(): array
    {
        $variant = $this->relationLoaded('variant') ? $this->variant : $this->variant()->first();

        return ['ac' => $variant?->ac_connector_type_id, 'dc' => $variant?->dc_connector_type_id];
    }

    /**
     * Station connector type ids this vehicle can use, from connector_compatibility_rules.
     *
     * @return array{direct: int[], adapter: int[]}
     */
    public function compatibleStationConnectorTypeIds(): array
    {
        $resolved = ConnectorCompatibilityRule::resolveFor(array_values(array_filter($this->connectorTypeIds())));

        return ['direct' => $resolved['direct'], 'adapter' => $resolved['adapter']];
    }

    /**
     * Full compatibility picture (direct / adapter / incompatible + rule details) for the garage section.
     *
     * @return array{direct: int[], adapter: int[], incompatible: int[], rules: array<int, array<string, mixed>>}
     */
    public function connectorCompatibility(): array
    {
        return ConnectorCompatibilityRule::resolveFor(array_values(array_filter($this->connectorTypeIds())));
    }

    /** Effective battery capacity: explicit battery variant, else the vehicle variant's figure. */
    public function batteryCapacityKwh(): ?string
    {
        $battery = $this->relationLoaded('battery') ? $this->battery : $this->battery()->first();
        if ($battery) {
            return (string) $battery->capacity_kwh;
        }
        $variant = $this->relationLoaded('variant') ? $this->variant : $this->variant()->first();

        return $variant?->battery_capacity_kwh !== null ? (string) $variant->battery_capacity_kwh : null;
    }

    // ---- Deletion guard (extensible by other modules via VehicleDeletionGuards) ----------------

    /** Null when the vehicle may be deleted, otherwise a translated reason. */
    public function deletionBlockedReason(): ?string
    {
        if ($this->status !== VehicleStatus::Archived) {
            return __('garage.delete.must_be_archived');
        }

        return VehicleDeletionGuards::blockingReason($this);
    }

    public function canBeDeleted(): bool
    {
        return $this->deletionBlockedReason() === null;
    }

    // ---- VIN -------------------------------------------------------------------------------

    /** Upper-case, strip whitespace/dashes. Does not validate. */
    public static function normalizeVin(?string $vin): ?string
    {
        if ($vin === null) {
            return null;
        }
        $vin = strtoupper(preg_replace('/[\s\-]+/', '', $vin) ?? '');

        return $vin === '' ? null : $vin;
    }

    public static function isValidVin(string $vin): bool
    {
        return (bool) preg_match(self::VIN_PATTERN, $vin);
    }

    /** Canonical hash used for duplicate detection and lookups (sha256 of the normalized VIN). */
    public static function hashVin(string $vin): string
    {
        return hash('sha256', (string) self::normalizeVin($vin));
    }

    public function hasVin(): bool
    {
        return $this->vin_hash !== null;
    }

    /** Masked VIN for display: only the last 4 characters are shown. */
    public function maskedVin(): ?string
    {
        $vin = $this->vin;
        if (! $vin) {
            return null;
        }

        return str_repeat('*', max(0, strlen($vin) - 4)).substr($vin, -4);
    }

    // ---- Image -----------------------------------------------------------------------------

    /** Authorized download URL of the photo (medium variant), or the public-disk URL of an imported image. */
    public function imageUrl(string $variant = 'medium'): ?string
    {
        if ($this->image_attachment_id) {
            $attachment = $this->relationLoaded('image') ? $this->image : $this->image()->first();
            if ($attachment) {
                return route('shared.files.download', ['attachment' => $attachment, 'variant' => $attachment->variantPath($variant) ? $variant : null]);
            }
        }
        // `image_path` is reserved for images placed on the public disk by imports (no attachment row).
        if ($this->image_path) {
            return Storage::disk('public')->url($this->image_path);
        }

        return null;
    }

    /** Files contract: the owner, or staff with vehicles.view, may see this vehicle's files. */
    public function attachmentViewableBy(User $user, Attachment $attachment): bool
    {
        return $this->isOwnedBy($user) || $user->can('vehicles.view');
    }
}
