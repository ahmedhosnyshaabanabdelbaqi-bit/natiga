<?php

namespace App\Modules\Vehicles\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Vehicles\Http\Requests\CompatibilityMatrixRequest;
use App\Modules\Vehicles\Services\VehicleMasterService;
use Illuminate\Http\RedirectResponse;

class CompatibilityRuleController extends Controller
{
    public function __construct(private readonly VehicleMasterService $master) {}

    public function update(CompatibilityMatrixRequest $request): RedirectResponse
    {
        $changed = $this->master->saveCompatibilityMatrix($request->validated('rules'), $request->user());

        return back()->with('success', __('vehicles.admin.compatibility.saved', ['count' => $changed]));
    }
}
