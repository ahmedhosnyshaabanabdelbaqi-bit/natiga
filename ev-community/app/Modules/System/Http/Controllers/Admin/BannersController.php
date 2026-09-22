<?php

namespace App\Modules\System\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Services\AuditService;
use App\Modules\System\Http\PerPage;
use App\Modules\System\Http\Requests\BannerRequest;
use App\Modules\System\Models\StatusBanner;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class BannersController extends Controller
{
    use AuthorizesRequests;

    public function __construct(private readonly AuditService $audit) {}

    public function index(Request $request): Response
    {
        $this->authorize('viewAny', StatusBanner::class);

        return Inertia::render('admin/banners/index', [
            'banners' => StatusBanner::query()->orderByDesc('id')->paginate(PerPage::from($request))->withQueryString()->through(fn (StatusBanner $b) => $this->serialize($b)),
            'levels' => BannerRequest::LEVELS,
            'targets' => BannerRequest::TARGETS,
        ]);
    }

    public function store(BannerRequest $request): RedirectResponse
    {
        $this->authorize('create', StatusBanner::class);
        $banner = StatusBanner::query()->create($request->validated() + ['created_by' => $request->user()->id]);
        $this->audit->log('banners.created', $banner, new: $this->serialize($banner), actor: $request->user());

        return back()->with('success', __('system.banners.messages.created'));
    }

    public function update(BannerRequest $request, StatusBanner $banner): RedirectResponse
    {
        $this->authorize('update', $banner);
        $before = $this->serialize($banner);
        $banner->fill($request->validated())->save();
        $this->audit->logChanges('banners.updated', $banner, $before, $this->serialize($banner), actor: $request->user());

        return back()->with('success', __('system.banners.messages.updated'));
    }

    public function destroy(Request $request, StatusBanner $banner): RedirectResponse
    {
        $this->authorize('delete', $banner);
        $snapshot = $this->serialize($banner);
        $banner->delete();
        $this->audit->log('banners.deleted', null, old: $snapshot, actor: $request->user(), entityLabel: 'banner#'.$snapshot['id']);

        return back()->with('success', __('system.banners.messages.deleted'));
    }

    /** @return array<string, mixed> */
    private function serialize(StatusBanner $banner): array
    {
        return [
            'id' => $banner->id,
            'level' => $banner->level,
            'message_ar' => $banner->message_ar,
            'message_en' => $banner->message_en,
            'targets' => array_values($banner->targets ?? []),
            'is_active' => (bool) $banner->is_active,
            'starts_at' => $banner->starts_at?->toIso8601String(),
            'ends_at' => $banner->ends_at?->toIso8601String(),
            'created_at' => $banner->created_at?->toIso8601String(),
        ];
    }
}
