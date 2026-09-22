<?php

namespace App\Modules\System\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\System\Services\SetupChecklist;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class SetupController extends Controller
{
    public function __invoke(SetupChecklist $checklist): Response
    {
        Gate::authorize('settings.manage');
        $items = $checklist->items();

        return Inertia::render('admin/setup/index', [
            'items' => $items,
            'done' => count(array_filter($items, fn ($i) => $i['ok'])),
            'total' => count($items),
        ]);
    }
}
