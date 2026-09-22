<?php

namespace App\Modules\Vehicles\Services;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Files\Models\Attachment;
use App\Modules\Files\Services\AttachmentService;
use App\Modules\Vehicles\Models\BatteryVariant;
use App\Modules\Vehicles\Models\ConnectorCompatibilityRule;
use App\Modules\Vehicles\Models\ConnectorType;
use App\Modules\Vehicles\Models\Enums\Compatibility;
use App\Modules\Vehicles\Models\VehicleMake;
use App\Modules\Vehicles\Models\VehicleModel;
use App\Modules\Vehicles\Models\VehicleVariant;
use App\Support\Exceptions\DomainException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Admin CRUD for vehicle master data. Every change is audited ('vehicles.master_changed')
 * and invalidates the public vehicle-data cache.
 */
final class VehicleMasterService
{
    public const LOGO_COLLECTION = 'vehicle_make_logo';

    public function __construct(private AuditService $audit, private VehicleDataService $data, private AttachmentService $attachments) {}

    // ---- Makes -----------------------------------------------------------------------------

    public function saveMake(array $data, ?VehicleMake $make, ?UploadedFile $logo, User $actor, bool $removeLogo = false): VehicleMake
    {
        $fields = ['slug', 'name_ar', 'name_en', 'country_code', 'is_active', 'sort_order', 'logo_path'];

        return DB::transaction(function () use ($data, $make, $logo, $actor, $removeLogo, $fields) {
            $make ??= new VehicleMake;
            $before = $make->exists ? $make->only($fields) : [];
            $make->fill([
                'name_ar' => trim($data['name_ar']),
                'name_en' => trim($data['name_en']),
                'slug' => $this->uniqueSlug(VehicleMake::query(), $this->clean($data['slug'] ?? null) ?? $data['name_en'], $make->exists ? $make->id : null),
                'country_code' => isset($data['country_code']) && $data['country_code'] !== '' ? strtoupper($data['country_code']) : null,
                'is_active' => (bool) ($data['is_active'] ?? true),
                'sort_order' => (int) ($data['sort_order'] ?? 0),
            ]);
            if (($removeLogo || $logo) && $make->logo_path) {
                $this->discardLogo($make);
            }
            $make->save();
            if ($logo) {
                // Public master-data image: stored through the Files module (MIME sniffing, random name, variants).
                $attachment = $this->attachments->store($logo, $make, self::LOGO_COLLECTION, Attachment::VISIBILITY_PUBLIC, 'image', $actor);
                $make->forceFill(['logo_path' => $attachment->storage_path])->save();
            }
            $this->logChange($make, $before, $make->only($fields), $actor);

            return $make;
        });
    }

    public function toggleMake(VehicleMake $make, User $actor): VehicleMake
    {
        return $this->toggle($make, $actor);
    }

    public function deleteMake(VehicleMake $make, User $actor): void
    {
        if ($make->models()->exists() || $make->memberVehicles()->exists()) {
            throw DomainException::because('vehicles.errors.in_use');
        }
        DB::transaction(function () use ($make, $actor) {
            $this->audit->log('vehicles.master_changed', $make, old: $make->only(['slug', 'name_en']), new: ['deleted' => true], actor: $actor);
            if ($make->logo_path) {
                $this->discardLogo($make);
            }
            $make->delete();
            $this->data->flush();
        });
    }

    // ---- Models ----------------------------------------------------------------------------

    public function saveModel(array $data, ?VehicleModel $model, User $actor): VehicleModel
    {
        return DB::transaction(function () use ($data, $model, $actor) {
            $model ??= new VehicleModel;
            $fields = ['vehicle_make_id', 'slug', 'name_ar', 'name_en', 'model_code', 'body_type', 'is_active', 'sort_order'];
            $before = $model->exists ? $model->only($fields) : [];
            $makeId = (int) $data['vehicle_make_id'];
            // Member vehicles store make + model: moving a model that is in use would make them inconsistent.
            if ($model->exists && (int) $model->vehicle_make_id !== $makeId && $model->memberVehicles()->exists()) {
                throw DomainException::because('vehicles.errors.hierarchy_in_use', field: 'vehicle_make_id');
            }
            $model->fill([
                'vehicle_make_id' => $makeId,
                'name_ar' => trim($data['name_ar']),
                'name_en' => trim($data['name_en']),
                'slug' => $this->uniqueSlug(VehicleModel::query()->where('vehicle_make_id', $makeId), $this->clean($data['slug'] ?? null) ?? $data['name_en'], $model->exists ? $model->id : null),
                'model_code' => $this->clean($data['model_code'] ?? null),
                'body_type' => $this->clean($data['body_type'] ?? null),
                'is_active' => (bool) ($data['is_active'] ?? true),
                'sort_order' => (int) ($data['sort_order'] ?? 0),
            ]);
            $model->save();
            $this->logChange($model, $before, $model->only($fields), $actor);

            return $model;
        });
    }

    public function toggleModel(VehicleModel $model, User $actor): VehicleModel
    {
        return $this->toggle($model, $actor);
    }

    public function deleteModel(VehicleModel $model, User $actor): void
    {
        if ($model->variants()->exists() || $model->memberVehicles()->exists()) {
            throw DomainException::because('vehicles.errors.in_use');
        }
        DB::transaction(function () use ($model, $actor) {
            $this->audit->log('vehicles.master_changed', $model, old: $model->only(['slug', 'name_en', 'vehicle_make_id']), new: ['deleted' => true], actor: $actor);
            $model->delete();
            $this->data->flush();
        });
    }

    // ---- Variants --------------------------------------------------------------------------

    public function saveVariant(array $data, ?VehicleVariant $variant, User $actor): VehicleVariant
    {
        return DB::transaction(function () use ($data, $variant, $actor) {
            $variant ??= new VehicleVariant;
            $fields = ['vehicle_model_id', 'name_ar', 'name_en', 'trim', 'market_version', 'year_from', 'year_to', 'battery_variant_id', 'ac_connector_type_id', 'dc_connector_type_id', 'battery_capacity_kwh', 'motor_kw', 'range_km_wltp', 'notes', 'is_active', 'sort_order'];
            $before = $variant->exists ? $variant->only($fields) : [];
            if ($variant->exists && (int) $variant->vehicle_model_id !== (int) $data['vehicle_model_id'] && $variant->memberVehicles()->exists()) {
                throw DomainException::because('vehicles.errors.hierarchy_in_use', field: 'vehicle_model_id');
            }
            $variant->fill([
                'vehicle_model_id' => (int) $data['vehicle_model_id'],
                'name_ar' => trim($data['name_ar']),
                'name_en' => trim($data['name_en']),
                'trim' => $this->clean($data['trim'] ?? null),
                'market_version' => $data['market_version'] ?? 'unknown',
                'year_from' => (int) $data['year_from'],
                'year_to' => isset($data['year_to']) && $data['year_to'] !== '' ? (int) $data['year_to'] : null,
                'battery_variant_id' => $this->id($data['battery_variant_id'] ?? null),
                'ac_connector_type_id' => $this->id($data['ac_connector_type_id'] ?? null),
                'dc_connector_type_id' => $this->id($data['dc_connector_type_id'] ?? null),
                'battery_capacity_kwh' => isset($data['battery_capacity_kwh']) && $data['battery_capacity_kwh'] !== '' ? $data['battery_capacity_kwh'] : null,
                'motor_kw' => $this->id($data['motor_kw'] ?? null),
                'range_km_wltp' => $this->id($data['range_km_wltp'] ?? null),
                'notes' => $this->clean($data['notes'] ?? null),
                'is_active' => (bool) ($data['is_active'] ?? true),
                'sort_order' => (int) ($data['sort_order'] ?? 0),
            ]);
            if ($variant->battery_capacity_kwh === null && $variant->battery_variant_id) {
                $variant->battery_capacity_kwh = BatteryVariant::query()->whereKey($variant->battery_variant_id)->value('capacity_kwh');
            }
            $variant->save();
            $this->logChange($variant, $before, $variant->only($fields), $actor);

            return $variant;
        });
    }

    public function toggleVariant(VehicleVariant $variant, User $actor): VehicleVariant
    {
        return $this->toggle($variant, $actor);
    }

    public function deleteVariant(VehicleVariant $variant, User $actor): void
    {
        if ($variant->memberVehicles()->exists()) {
            throw DomainException::because('vehicles.errors.in_use');
        }
        DB::transaction(function () use ($variant, $actor) {
            $this->audit->log('vehicles.master_changed', $variant, old: $variant->only(['name_en', 'vehicle_model_id']), new: ['deleted' => true], actor: $actor);
            $variant->delete();
            $this->data->flush();
        });
    }

    // ---- Batteries -------------------------------------------------------------------------

    public function saveBattery(array $data, ?BatteryVariant $battery, User $actor): BatteryVariant
    {
        return DB::transaction(function () use ($data, $battery, $actor) {
            $battery ??= new BatteryVariant;
            $before = $battery->exists ? $battery->only(['name', 'capacity_kwh', 'chemistry', 'notes']) : [];
            $battery->fill([
                'name' => trim($data['name']),
                'capacity_kwh' => $data['capacity_kwh'],
                'chemistry' => $this->clean($data['chemistry'] ?? null),
                'notes' => $this->clean($data['notes'] ?? null),
            ])->save();
            $this->logChange($battery, $before, $battery->only(['name', 'capacity_kwh', 'chemistry', 'notes']), $actor);

            return $battery;
        });
    }

    public function deleteBattery(BatteryVariant $battery, User $actor): void
    {
        if ($battery->variants()->exists()) {
            throw DomainException::because('vehicles.errors.in_use');
        }
        DB::transaction(function () use ($battery, $actor) {
            $this->audit->log('vehicles.master_changed', $battery, old: $battery->only(['name', 'capacity_kwh']), new: ['deleted' => true], actor: $actor);
            $battery->delete();
            $this->data->flush();
        });
    }

    // ---- Connector types & compatibility ---------------------------------------------------

    public function saveConnectorType(array $data, ?ConnectorType $connector, User $actor): ConnectorType
    {
        return DB::transaction(function () use ($data, $connector, $actor) {
            $connector ??= new ConnectorType;
            $fields = ['code', 'name_ar', 'name_en', 'current_type', 'is_active', 'sort_order'];
            $before = $connector->exists ? $connector->only($fields) : [];
            $connector->fill([
                'code' => Str::snake(strtolower(trim($data['code']))),
                'name_ar' => trim($data['name_ar']),
                'name_en' => trim($data['name_en']),
                'current_type' => $data['current_type'],
                'is_active' => (bool) ($data['is_active'] ?? true),
                'sort_order' => (int) ($data['sort_order'] ?? 0),
            ])->save();
            $this->logChange($connector, $before, $connector->only($fields), $actor);

            return $connector;
        });
    }

    public function toggleConnectorType(ConnectorType $connector, User $actor): ConnectorType
    {
        return $this->toggle($connector, $actor);
    }

    /**
     * Bulk save of the vehicle × station matrix. verified_by / verified_at are set on every saved cell.
     *
     * @param  array<int, array{vehicle_connector_type_id: int, station_connector_type_id: int, compatibility: string, adapter_name?: ?string, notes?: ?string}>  $rules
     * @return int number of changed cells
     */
    public function saveCompatibilityMatrix(array $rules, User $actor): int
    {
        return DB::transaction(function () use ($rules, $actor) {
            $changed = 0;
            foreach ($rules as $row) {
                $compatibility = Compatibility::from($row['compatibility']);
                $rule = ConnectorCompatibilityRule::query()->firstOrNew([
                    'vehicle_connector_type_id' => (int) $row['vehicle_connector_type_id'],
                    'station_connector_type_id' => (int) $row['station_connector_type_id'],
                ]);
                $before = $rule->exists ? ['compatibility' => $rule->compatibility->value, 'adapter_name' => $rule->adapter_name, 'notes' => $rule->notes] : [];
                $rule->fill([
                    'compatibility' => $compatibility,
                    'adapter_name' => $compatibility === Compatibility::Adapter ? $this->clean($row['adapter_name'] ?? null) : null,
                    'notes' => $this->clean($row['notes'] ?? null),
                ]);
                $after = ['compatibility' => $rule->compatibility->value, 'adapter_name' => $rule->adapter_name, 'notes' => $rule->notes];
                if (! $rule->exists || $before != $after) {
                    $rule->verified_by = $actor->id;
                    $rule->verified_at = now();
                    $rule->save();
                    $codes = ConnectorType::query()->whereIn('id', [$rule->vehicle_connector_type_id, $rule->station_connector_type_id])->pluck('code', 'id');
                    $label = ($codes[$rule->vehicle_connector_type_id] ?? $rule->vehicle_connector_type_id).' → '.($codes[$rule->station_connector_type_id] ?? $rule->station_connector_type_id);
                    $this->audit->log('vehicles.master_changed', $rule, old: $before, new: $after + ['verified_at' => $rule->verified_at?->toIso8601String()], actor: $actor, entityLabel: $label);
                    $changed++;
                }
            }
            $this->data->flush();

            return $changed;
        });
    }

    // ---- Internals -------------------------------------------------------------------------

    private function toggle(Model $entity, User $actor): Model
    {
        return DB::transaction(function () use ($entity, $actor) {
            $old = (bool) $entity->getAttribute('is_active');
            $entity->forceFill(['is_active' => ! $old])->save();
            $this->audit->log('vehicles.master_changed', $entity, old: ['is_active' => $old], new: ['is_active' => ! $old], actor: $actor);
            $this->data->flush();

            return $entity;
        });
    }

    private function logChange(Model $entity, array $before, array $after, User $actor): void
    {
        $this->audit->logChanges('vehicles.master_changed', $entity, $before, $after, actor: $actor);
        $this->data->flush();
    }

    /** Removes the current logo after commit (attachment row + files, or a legacy public-disk path). */
    private function discardLogo(VehicleMake $make): void
    {
        $path = $make->logo_path;
        $make->logo_path = null;
        if ($path === null) {
            return;
        }
        $attachment = $make->exists
            ? Attachment::query()->where('owner_type', $make->getMorphClass())->where('owner_id', $make->id)->where('storage_path', $path)->first()
            : null;
        DB::afterCommit(function () use ($attachment, $path) {
            if ($attachment) {
                $this->attachments->delete($attachment);

                return;
            }
            Storage::disk((string) config('filesystems.public_disk', 'public'))->delete($path);
        });
    }

    private function uniqueSlug(Builder $query, string $source, ?int $exceptId): string
    {
        $base = Str::slug($source) ?: Str::lower(Str::random(6));
        $slug = $base;
        $i = 2;
        while ((clone $query)->where('slug', $slug)->when($exceptId, fn ($q) => $q->whereKeyNot($exceptId))->exists()) {
            $slug = $base.'-'.$i++;
        }

        return $slug;
    }

    private function clean(?string $value): ?string
    {
        $value = $value === null ? null : trim($value);

        return $value === '' ? null : $value;
    }

    private function id(mixed $value): ?int
    {
        return $value === null || $value === '' ? null : (int) $value;
    }
}
