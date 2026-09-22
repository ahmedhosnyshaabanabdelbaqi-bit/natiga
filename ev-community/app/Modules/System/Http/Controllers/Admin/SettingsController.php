<?php

namespace App\Modules\System\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\System\Services\BrandingUploads;
use App\Modules\System\Services\SettingsForm;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class SettingsController extends Controller
{
    public function __construct(private readonly SettingsForm $form) {}

    public function index(Request $request): Response
    {
        abort_unless(Gate::any(['settings.view', 'settings.manage']), 403);
        $groups = $this->form->groups();
        $keys = array_column($groups, 'key');
        $active = $request->query('group');

        return Inertia::render('admin/settings/index', [
            'groups' => $groups,
            'activeGroup' => in_array($active, $keys, true) ? $active : ($keys[0] ?? 'general'),
            'canManage' => $request->user()->can('settings.manage'),
            'maxImageMb' => BrandingUploads::MAX_BYTES / 1024 / 1024,
        ]);
    }

    public function update(Request $request, string $group): RedirectResponse
    {
        Gate::authorize('settings.manage');
        $data = $request->validate(['values' => ['required', 'array'], 'reason' => ['nullable', 'string', 'max:500']]);
        $changed = $this->form->save($group, $data['values'], $request->user(), $data['reason'] ?? null);

        return redirect()->route('admin.settings.index', ['group' => $group])
            ->with('success', $changed === [] ? __('system.settings.messages.nothing_changed') : __('system.settings.messages.saved', ['count' => count($changed)]));
    }

    public function reset(Request $request, string $key): RedirectResponse
    {
        Gate::authorize('settings.manage');
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:500']]);
        $this->form->reset($key, $request->user(), $data['reason'] ?? null);

        return back()->with('success', __('system.settings.messages.reset', ['key' => $key]));
    }

    public function upload(Request $request, string $key, BrandingUploads $uploads): RedirectResponse
    {
        Gate::authorize('settings.manage');
        $request->validate(['file' => ['required', 'file', 'max:2048']]);
        $uploads->store($key, $request->file('file'), $request->user());

        return redirect()->route('admin.settings.index', ['group' => 'branding'])->with('success', __('system.settings.messages.image_uploaded'));
    }
}
