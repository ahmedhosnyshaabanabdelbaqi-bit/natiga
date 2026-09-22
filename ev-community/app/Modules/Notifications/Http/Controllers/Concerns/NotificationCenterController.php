<?php

namespace App\Modules\Notifications\Http\Controllers\Concerns;

use App\Http\Controllers\Controller;
use App\Modules\Notifications\Models\Enums\NotificationCategory;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Services\NotificationService;
use App\Modules\Notifications\Support\NotificationUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

/**
 * One notification center for every portal (member / admin inbox / partner). Notifications are strictly personal:
 * every lookup is scoped to the signed-in user (another user's id answers 404, never 403, so ids cannot be probed),
 * and the policy is checked again as defense in depth.
 */
abstract class NotificationCenterController extends Controller
{
    public const PER_PAGE = 20;

    public function __construct(protected readonly NotificationService $notifications) {}

    /** Inertia page component, e.g. `member/notifications/index`. */
    abstract protected function component(): string;

    /** Where "notification settings" lives for this portal (null when the portal has none). */
    protected function preferencesUrl(): ?string
    {
        return null;
    }

    public function index(Request $request): Response
    {
        $user = $request->user();
        $category = NotificationCategory::tryFrom((string) $request->query('category', ''))?->value;
        $unreadOnly = $request->boolean('unread');

        $paginator = $this->notifications->paginateFor($user, $category, $unreadOnly, self::PER_PAGE)
            ->through(fn (Notification $n) => $this->notifications->present($n));

        return Inertia::render($this->component(), [
            'notifications' => $paginator,
            'filters' => ['category' => $category, 'unread' => $unreadOnly],
            'categories' => NotificationCategory::options(),
            'unreadCount' => $this->notifications->unreadCount($user),
            'preferencesUrl' => $this->preferencesUrl(),
        ]);
    }

    public function unreadCount(Request $request): JsonResponse
    {
        return response()->json(['data' => ['unread' => $this->notifications->unreadCount($request->user())]])
            ->header('Cache-Control', 'no-store, private');
    }

    public function markRead(Request $request, string $notification): SymfonyResponse
    {
        $user = $request->user();
        $model = Notification::query()->forUser($user)->where('public_id', $notification)->firstOrFail();
        Gate::authorize('markRead', $model);

        $this->notifications->markRead($user, $model);

        if ($request->expectsJson() && ! $request->header('X-Inertia')) {
            return response()->json(['data' => ['id' => $model->public_id, 'unread' => $this->notifications->unreadCount($user)]]);
        }
        if ($request->boolean('open') && $model->url !== null && NotificationUrl::isValid($model->url)) {
            return NotificationUrl::isInternal($model->url) ? redirect()->to($model->url) : Inertia::location($model->url);
        }

        return back();
    }

    public function markAllRead(Request $request): RedirectResponse|JsonResponse
    {
        $user = $request->user();
        $category = NotificationCategory::tryFrom((string) $request->input('category', ''))?->value;
        $updated = $this->notifications->markAllRead($user, $category);

        if ($request->expectsJson() && ! $request->header('X-Inertia')) {
            return response()->json(['data' => ['updated' => $updated, 'unread' => $this->notifications->unreadCount($user)]]);
        }

        return back()->with('success', __('notifications.center.all_marked_read'));
    }
}
