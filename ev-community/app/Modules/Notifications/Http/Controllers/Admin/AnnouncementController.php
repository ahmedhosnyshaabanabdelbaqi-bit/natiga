<?php

namespace App\Modules\Notifications\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Notifications\Http\Requests\AnnouncementRequest;
use App\Modules\Notifications\Http\Requests\EstimateAudienceRequest;
use App\Modules\Notifications\Http\Requests\PreviewAnnouncementRequest;
use App\Modules\Notifications\Http\Requests\ScheduleAnnouncementRequest;
use App\Modules\Notifications\Models\AnnouncementCampaign;
use App\Modules\Notifications\Models\Enums\CampaignStatus;
use App\Modules\Notifications\Models\Enums\NotificationCategory;
use App\Modules\Notifications\Services\AnnouncementAudiences;
use App\Modules\Notifications\Services\AnnouncementService;
use App\Modules\Notifications\Services\Channels;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * `/admin/notifications`: announcement campaigns. notifications.manage creates/edits/sends; notifications.view is
 * read-only (route middleware + policy on every action).
 */
class AnnouncementController extends Controller
{
    public function __construct(private readonly AnnouncementService $announcements) {}

    public function index(Request $request): Response
    {
        Gate::authorize('viewAny', AnnouncementCampaign::class);
        $filters = array_filter($request->validate([
            'status' => ['nullable', Rule::in(CampaignStatus::values())],
            'search' => ['nullable', 'string', 'max:100'],
        ]), fn ($v) => $v !== null && $v !== '');

        return Inertia::render('admin/notifications/index', [
            'campaigns' => $this->announcements->paginate($filters)->through(fn (AnnouncementCampaign $c) => $this->announcements->present($c)),
            'filters' => $filters,
            'statuses' => CampaignStatus::options(),
            'counts' => $this->announcements->statusCounts(),
            'canManage' => $request->user()->can('create', AnnouncementCampaign::class),
        ]);
    }

    public function create(Request $request): Response
    {
        Gate::authorize('create', AnnouncementCampaign::class);

        return Inertia::render('admin/notifications/create', $this->formOptions());
    }

    public function store(AnnouncementRequest $request): RedirectResponse
    {
        $campaign = $this->announcements->create($request->validated(), $request->user());

        return redirect()->route('admin.notifications.show', $campaign)->with('success', __('notifications.admin.flash.created'));
    }

    public function show(Request $request, AnnouncementCampaign $campaign): Response
    {
        Gate::authorize('view', $campaign);
        $campaign->load('creator:id,name');
        $user = $request->user();

        return Inertia::render('admin/notifications/show', [
            'campaign' => $this->announcements->present($campaign, withParams: true),
            'stats' => $this->announcements->recipientStats($campaign),
            'canManage' => $user->can('create', AnnouncementCampaign::class),
            'channels' => Channels::options(),
        ]);
    }

    public function edit(AnnouncementCampaign $campaign): Response|RedirectResponse
    {
        Gate::authorize('create', AnnouncementCampaign::class);
        if (! $campaign->status->isEditable()) {
            return redirect()->route('admin.notifications.show', $campaign)->with('error', __('notifications.errors.campaign_not_editable'));
        }

        return Inertia::render('admin/notifications/edit', [
            ...$this->formOptions(),
            'campaign' => $this->announcements->present($campaign, withParams: true),
        ]);
    }

    public function update(AnnouncementRequest $request, AnnouncementCampaign $campaign): RedirectResponse
    {
        $this->announcements->update($campaign, $request->validated(), $request->user());

        return redirect()->route('admin.notifications.show', $campaign)->with('success', __('notifications.admin.flash.updated'));
    }

    public function destroy(Request $request, AnnouncementCampaign $campaign): RedirectResponse
    {
        Gate::authorize('delete', $campaign);
        $this->announcements->delete($campaign, $request->user());

        return redirect()->route('admin.notifications.index')->with('success', __('notifications.admin.flash.deleted'));
    }

    public function send(Request $request, AnnouncementCampaign $campaign): RedirectResponse
    {
        Gate::authorize('send', $campaign);
        $this->announcements->sendNow($campaign, $request->user());

        return redirect()->route('admin.notifications.show', $campaign)->with('success', __('notifications.admin.flash.sent'));
    }

    public function schedule(ScheduleAnnouncementRequest $request, AnnouncementCampaign $campaign): RedirectResponse
    {
        $at = Carbon::parse((string) $request->validated('scheduled_at'), config('app.timezone'));
        $this->announcements->schedule($campaign, $at, $request->user());

        return redirect()->route('admin.notifications.show', $campaign)->with('success', __('notifications.admin.flash.scheduled'));
    }

    public function cancel(Request $request, AnnouncementCampaign $campaign): RedirectResponse
    {
        Gate::authorize('cancel', $campaign);
        $reason = $request->validate(['reason' => ['nullable', 'string', 'min:5', 'max:500']])['reason'] ?? null;
        $this->announcements->cancel($campaign, $request->user(), $reason);

        return redirect()->route('admin.notifications.show', $campaign)->with('success', __('notifications.admin.flash.cancelled'));
    }

    public function estimate(EstimateAudienceRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $count = $this->announcements->estimate($validated['audience_type'], (array) ($validated['audience_params'] ?? []));

        return response()->json(['data' => ['count' => $count, 'label' => trans_choice('notifications.admin.estimate_result', $count, ['count' => number_format($count)])]]);
    }

    public function preview(PreviewAnnouncementRequest $request): JsonResponse
    {
        return response()->json(['data' => $this->announcements->preview($request->validated())]);
    }

    /** @return array<string, mixed> */
    private function formOptions(): array
    {
        return [
            'audiences' => AnnouncementAudiences::options(),
            'channels' => Channels::options(),
            'categories' => NotificationCategory::options(),
        ];
    }
}
