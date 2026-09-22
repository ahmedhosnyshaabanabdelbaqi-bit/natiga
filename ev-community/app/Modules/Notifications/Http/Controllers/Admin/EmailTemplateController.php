<?php

namespace App\Modules\Notifications\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Notifications\Http\Requests\UpdateEmailTemplateRequest;
use App\Modules\Notifications\Models\EmailTemplate;
use App\Modules\Notifications\Services\EmailTemplateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** `/admin/notifications/templates`: email subject/body overrides per notification key and locale. */
class EmailTemplateController extends Controller
{
    public function __construct(private readonly EmailTemplateService $templates) {}

    public function index(Request $request): Response
    {
        Gate::authorize('viewAny', EmailTemplate::class);
        $filters = array_filter($request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'module' => ['nullable', 'string', 'max:60'],
            'state' => ['nullable', Rule::in(['customized', 'default'])],
        ]), fn ($v) => $v !== null && $v !== '');
        $customized = match ($filters['state'] ?? null) {
            'customized' => true,
            'default' => false,
            default => null,
        };

        return Inertia::render('admin/notifications/templates/index', [
            'templates' => $this->templates->list($filters['search'] ?? null, $filters['module'] ?? null, $customized),
            'modules' => $this->templates->moduleOptions(),
            'filters' => $filters,
            'canManage' => $request->user()->can('update', EmailTemplate::class),
        ]);
    }

    public function edit(string $key): Response
    {
        Gate::authorize('update', EmailTemplate::class);

        return Inertia::render('admin/notifications/templates/edit', [
            'template' => $this->templates->detail($key),
        ]);
    }

    public function update(UpdateEmailTemplateRequest $request, string $key): RedirectResponse
    {
        $this->templates->update($key, $request->validated(), $request->user());

        return redirect()->route('admin.notifications.templates.edit', ['key' => $key])->with('success', __('notifications.email_templates.saved'));
    }

    public function reset(Request $request, string $key): RedirectResponse
    {
        Gate::authorize('update', EmailTemplate::class);
        $this->templates->reset($key, $request->user());

        return redirect()->route('admin.notifications.templates.edit', ['key' => $key])->with('success', __('notifications.email_templates.reset_done'));
    }

    public function preview(UpdateEmailTemplateRequest $request, string $key): JsonResponse
    {
        return response()->json(['data' => $this->templates->preview($key, $request->validated())]);
    }
}
