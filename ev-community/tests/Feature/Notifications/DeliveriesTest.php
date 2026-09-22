<?php

namespace Tests\Feature\Notifications;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\Notifications\Jobs\SendEmailNotification;
use App\Modules\Notifications\Models\Enums\DeliveryStatus;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Models\NotificationDelivery;
use App\Modules\System\Services\DashboardKpis;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Feature\Notifications\Support\InteractsWithNotifications;
use Tests\TestCase;

class DeliveriesTest extends TestCase
{
    use InteractsWithNotifications;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpNotifications();
        Queue::fake();
    }

    private function failedEmail(): NotificationDelivery
    {
        $notification = Notification::factory()->create(['user_id' => $this->makeMember()->id, 'key' => 'orders.confirmed']);

        return NotificationDelivery::query()->create(['notification_id' => $notification->id, 'channel' => 'email', 'status' => 'failed', 'error' => 'SMTP timeout', 'attempts' => 3, 'queued_at' => now()]);
    }

    public function test_viewer_sees_failed_deliveries_without_retry(): void
    {
        $delivery = $this->failedEmail();
        $this->actingAsStaff(['notifications.view']);

        $this->get('/admin/notifications/deliveries')->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admin/notifications/deliveries')
                ->has('deliveries.data', 1)
                ->where('deliveries.data.0.notification_id', $delivery->notification->public_id)
                ->where('deliveries.data.0.reason', 'SMTP timeout')
                ->where('deliveries.data.0.can_retry', false)
                ->where('counts24h.failed', 1)
                ->where('canManage', false));

        $this->post("/admin/notifications/deliveries/{$delivery->notification->public_id}/email/retry")->assertForbidden();
    }

    public function test_staff_without_permission_cannot_see_deliveries(): void
    {
        $this->actingAsStaff([]);
        $this->get('/admin/notifications/deliveries')->assertForbidden();
    }

    public function test_manager_retries_a_failed_delivery_once(): void
    {
        $this->emailConfigured();
        $delivery = $this->failedEmail();
        $this->actingAsStaff(['notifications.manage']);

        $this->post("/admin/notifications/deliveries/{$delivery->notification->public_id}/email/retry")->assertRedirect()->assertSessionHasNoErrors();

        $this->assertSame(DeliveryStatus::Queued, $delivery->fresh()->status);
        $this->assertNull($delivery->fresh()->error);
        Queue::assertPushed(SendEmailNotification::class, fn (SendEmailNotification $job) => $job->deliveryId === $delivery->id);
        $this->assertTrue(AuditLog::query()->where('action', 'notifications.delivery_retried')->exists());

        // Second click: the delivery is no longer failed.
        $this->post("/admin/notifications/deliveries/{$delivery->notification->public_id}/email/retry")->assertSessionHasErrors('delivery');
        Queue::assertPushed(SendEmailNotification::class, 1);
    }

    public function test_retry_is_refused_while_the_channel_is_not_configured(): void
    {
        $delivery = $this->failedEmail();
        $this->actingAsStaff(['notifications.manage']);

        $this->post("/admin/notifications/deliveries/{$delivery->notification->public_id}/email/retry")->assertSessionHasErrors('delivery');
        $this->assertSame(DeliveryStatus::Failed, $delivery->fresh()->status);
        $this->post('/admin/notifications/deliveries/01ARZ3NDEKTSV4RRFFQ69G5FAV/email/retry')->assertNotFound();
    }

    public function test_failed_deliveries_kpi_is_registered(): void
    {
        $this->failedEmail();
        $staff = $this->makeStaff(['notifications.view']);

        $kpi = collect(DashboardKpis::resolveFor($staff))->firstWhere('key', 'failed_deliveries_24h');
        $this->assertNotNull($kpi);
        $this->assertSame(1, $kpi['value']);
        $this->assertNull(collect(DashboardKpis::resolveFor($this->makeStaff([])))->firstWhere('key', 'failed_deliveries_24h'));
    }
}
