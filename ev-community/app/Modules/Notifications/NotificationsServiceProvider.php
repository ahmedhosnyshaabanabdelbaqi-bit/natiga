<?php

namespace App\Modules\Notifications;

use App\Models\User;
use App\Modules\Notifications\Models\AnnouncementCampaign;
use App\Modules\Notifications\Models\EmailTemplate;
use App\Modules\Notifications\Models\Enums\DeliveryStatus;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Models\NotificationDelivery;
use App\Modules\Notifications\Policies\AnnouncementCampaignPolicy;
use App\Modules\Notifications\Policies\EmailTemplatePolicy;
use App\Modules\Notifications\Policies\NotificationPolicy;
use App\Modules\Notifications\Services\AnnouncementAudiences;
use App\Modules\Notifications\Services\Notify;
use App\Modules\System\Services\DashboardKpis;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Inertia\Inertia;

class NotificationsServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Gate::policy(Notification::class, NotificationPolicy::class);
        Gate::policy(AnnouncementCampaign::class, AnnouncementCampaignPolicy::class);
        Gate::policy(EmailTemplate::class, EmailTemplatePolicy::class);

        User::resolveRelationUsing('notifications', fn (User $user) => $user->hasMany(Notification::class, 'user_id'));

        AnnouncementAudiences::registerDefaults();

        // Unread badge for every portal layout (cheap: cached 60s per user, invalidated on write). Lazy: only evaluated
        // when an Inertia response is rendered.
        Inertia::share('unreadNotifications', fn () => Auth::user() instanceof User ? Notify::unreadCount(Auth::user()) : 0);

        DashboardKpis::register(
            'failed_deliveries_24h',
            'notifications.view',
            fn () => NotificationDelivery::query()->where('status', DeliveryStatus::Failed->value)->where('updated_at', '>=', now()->subDay())->count(),
            'notifications.kpis.failed_deliveries_24h',
            '/admin/notifications/deliveries?status=failed',
            'notification_deliveries.status = failed, last 24h',
            tone: 'danger',
            order: 90,
        );

        RateLimiter::for('notifications-poll', fn (Request $request) => Limit::perMinute(30)->by($request->user()?->id ?: $request->ip()));
        RateLimiter::for('notifications-write', fn (Request $request) => Limit::perMinute(60)->by($request->user()?->id ?: $request->ip()));

        $this->callAfterResolving(Schedule::class, function (Schedule $schedule) {
            $schedule->command('notifications:dispatch-scheduled')->everyMinute()->withoutOverlapping();
            $schedule->command('notifications:purge')->weeklyOn(1, '03:30');
        });
    }
}
