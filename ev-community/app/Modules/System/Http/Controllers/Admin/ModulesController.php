<?php

namespace App\Modules\System\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\System\Http\Requests\ToggleModuleRequest;
use App\Modules\System\Services\Modules;
use App\Support\Exceptions\DomainException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class ModulesController extends Controller
{
    public function index(): Response
    {
        Gate::authorize('modules.manage');

        return Inertia::render('admin/modules/index', [
            'modules' => array_values(Modules::all()),
        ]);
    }

    public function update(ToggleModuleRequest $request, string $module): RedirectResponse
    {
        Gate::authorize('modules.manage');
        $definition = config('ev.modules.'.$module);
        if ($definition === null) {
            abort(404);
        }
        $enabled = $request->boolean('enabled');
        if (($definition['core'] ?? false) && ! $enabled) {
            throw DomainException::because('system.modules.errors.core_locked', ['module' => $module], 'enabled');
        }
        Modules::setEnabled($module, $enabled, $request->user(), $request->validated('reason'));

        return back()->with('success', __($enabled ? 'system.modules.messages.enabled' : 'system.modules.messages.disabled', ['module' => $definition['name'][app()->getLocale()] ?? $module]));
    }
}
