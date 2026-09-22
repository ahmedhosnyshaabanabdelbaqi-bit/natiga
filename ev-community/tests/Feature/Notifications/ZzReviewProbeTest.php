<?php

namespace Tests\Feature\Notifications;

use App\Modules\Notifications\Models\Enums\NotificationChannel;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Models\NotificationDelivery;
use App\Modules\Notifications\Services\MarketingConsent;
use App\Modules\Notifications\Services\NotificationPreferences;
use App\Modules\Notifications\Services\Notify;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Feature\Notifications\Support\InteractsWithNotifications;
use Tests\TestCase;

class ZzReviewProbeTest extends TestCase
{
    use InteractsWithNotifications;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpNotifications();
        Queue::fake();
    }

    public function test_probe_withdrawn_consent_shown_and_resave(): void
    {
        $member = $this->actingAsMember();
        $this->put('/account/notification-preferences', ['preferences' => ['marketing' => ['email' => true]]])->assertSessionHasNoErrors();
        $this->assertTrue(MarketingConsent::has($member, NotificationChannel::Email));
        // Member withdraws marketing email on the privacy page (Members module writes consent_logs).
        MarketingConsent::withdraw($member, NotificationChannel::Email);
        $this->get('/account/notification-preferences')->assertInertia(fn (Assert $p) => $p->where('matrix.categories.10.channels.email.enabled', false));
    }

    public function test_probe_dedup_inside_outer_transaction(): void
    {
        $member = $this->makeMember();
        DB::transaction(function () use ($member) {
            $a = Notify::send($member, 'system.generic', ['title' => 'x'], 'system', true, 'k1');
            $b = Notify::send($member, 'system.generic', ['title' => 'x'], 'system', true, 'k1');
            $this->assertSame($a->id, $b->id);
        });
        $this->assertSame(1, Notification::query()->count());
        $this->assertSame(1, NotificationDelivery::query()->where('channel', 'email')->count());
    }

    public function test_probe_unique_violation_inside_outer_transaction(): void
    {
        $member = $this->makeMember();
        DB::transaction(function () use ($member) {
            // Simulate a concurrent winner that inserted the row between the dedup lookup and the insert.
            Notification::factory()->create(['user_id' => $member->id, 'dedup_key' => 'race']);
            $service = app(\App\Modules\Notifications\Services\NotificationService::class);
            $ref = new \ReflectionClass($service);
            $n = $service->send($member, 'system.generic', [], 'system', true, 'race');
            $this->assertNotNull($n);
            // Outer transaction must still be usable.
            $this->assertSame(1, Notification::query()->where('user_id', $member->id)->count());
        });
    }
}
