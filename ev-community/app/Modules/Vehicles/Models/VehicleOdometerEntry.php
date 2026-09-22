<?php

namespace App\Modules\Vehicles\Models;

use App\Models\User;
use App\Modules\Vehicles\Models\Enums\OdometerSource;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Append-only odometer readings.
 *
 * @property int $id
 * @property int $member_vehicle_id
 * @property int $odometer_km
 * @property OdometerSource $source
 * @property CarbonInterface $recorded_at
 * @property string|null $note
 * @property int|null $created_by
 */
class VehicleOdometerEntry extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'vehicle_odometer_history';

    protected $guarded = [];

    protected function casts(): array
    {
        return ['odometer_km' => 'integer', 'source' => OdometerSource::class, 'recorded_at' => 'datetime', 'created_at' => 'datetime'];
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(MemberVehicle::class, 'member_vehicle_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
