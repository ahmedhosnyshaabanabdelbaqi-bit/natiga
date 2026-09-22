<?php

namespace App\Modules\Notifications\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Notifications\Models\Enums\DeliveryStatus;
use App\Modules\Notifications\Models\Enums\NotificationChannel;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Models\NotificationDelivery;
use App\Modules\Notifications\Services\Channels;
use App\Modules\Notifications\Services\NotificationService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * `/admin/notifications/deliveries`: email/SMS/WhatsApp delivery log (failed, skipped, queued, sent) with retry of
 * failed deliveries. Message bodies are not shown here; only what staff need to diagnose delivery problems.
 */
class DeliveryController extends Controller
{
    public function __construct(private readonly NotificationService $notifications) {}

    public function index(Request $request): Response
    {
        abort_unless($request->user()->can('notifications.view') || $request->user()->can('notifications.manage'), 403);
        $filters = array_filter($request->validate([
            'status' => ['nullable', Rule::in(DeliveryStatus::values())],
            'channel' => ['nullable', Rule::in([NotificationChannel::Email->value, NotificationChannel::Sms->value, NotificationChannel::WhatsApp->value])],
            'search' => ['nullable', 'string', 'max:100'],
        ]), fn ($v) => $v !== null && $v !== '');
        $filters['status'] ??= DeliveryStatus::Failed->value;

        $query = NotificationDelivery::query()
            ->where('channel', '!=', NotificationChannel::InApp->value)
            ->where('status', $filters['status'])
            ->when($filters['channel'] ?? null, fn (Builder $q, string $channel) => $q->where('channel', $channel))
            ->when($filters['search'] ?? null, function (Builder $q, string $search) {
                $like = '%'.addcslashes($search, '%_\\').'%';
                $q->whereHas('notification', fn (Builder $n) => $n->where('key', 'ilike', $like)
                    ->orWhereHas('user', fn (Builder $u) => $u->where('name', 'ilike', $like)
                        ->orWhereHas('membership', fn (Builder $m) => $m->where('member_number', 'ilike', $like))));
            })
            ->with(['notification:id,public_id,user_id,key,title,category,created_at', 'notification.user:id,name', 'notification.user.membership:id,user_id,member_number'])
            ->orderByDesc('updated_at')->orderByDesc('id');

        $canManage = $request->user()->can('notifications.manage');
        $configured = Channels::statusMap();
        $deliveries = $query->paginate(25)->withQueryString()->through(fn (NotificationDelivery $d) => [
            'id' => $d->notification?->public_id.':'.$d->channel->value,
            'notification_id' => $d->notification?->public_id,
            'key' => $d->notification?->key,
            'title' => $d->notification?->title,
            'category' => $d->notification?->category,
            'recipient' => $d->notification?->user?->name,
            'member_number' => $d->notification?->user?->membership?->member_number,
            'channel' => $d->channel->value,
            'channel_label' => $d->channel->label(),
            'status' => $d->status->value,
            'status_label' => $d->status->label(),
            'reason' => $d->reasonLabel(),
            'attempts' => $d->attempts,
            'provider' => $d->provider,
            'queued_at' => $d->queued_at?->toIso8601String(),
            'sent_at' => $d->sent_at?->toIso8601String(),
            'updated_at' => $d->updated_at?->toIso8601String(),
            'can_retry' => $canManage && $d->status === DeliveryStatus::Failed && ($configured[$d->channel->value] ?? false),
        ]);

        $counts = NotificationDelivery::query()->where('channel', '!=', NotificationChannel::InApp->value)
            ->where('updated_at', '>=', now()->subDay())
            ->selectRaw('status, count(*) as aggregate')->groupBy('status')->pluck('aggregate', 'status');

        return Inertia::render('admin/notifications/deliveries', [
            'deliveries' => $deliveries,
            'filters' => $filters,
            'statuses' => DeliveryStatus::options(),
            'channels' => array_values(array_filter(Channels::options(), fn (array $c) => $c['value'] !== NotificationChannel::InApp->value)),
            'counts24h' => array_map('intval', array_merge(array_fill_keys(DeliveryStatus::values(), 0), $counts->all())),
            'canManage' => $canManage,
        ]);
    }

    public function retry(Request $request, string $notification, string $channel): RedirectResponse
    {
        Gate::authorize('notifications.manage');
        $model = Notification::query()->where('public_id', $notification)->firstOrFail();
        $delivery = NotificationDelivery::query()->where('notification_id', $model->id)->where('channel', $channel)->firstOrFail();
        $this->notifications->retryDelivery($delivery, $request->user());

        return back()->with('success', __('notifications.deliveries.retried'));
    }
}
