<?php

namespace Tests\Feature\Notifications;

use App\Models\User;
use App\Modules\Notifications\Models\Enums\DeliveryStatus;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Models\NotificationDelivery;
use App\Modules\Notifications\Services\Notify;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Tests\Feature\Notifications\Support\InteractsWithNotifications;
use Tests\TestCase;

class NotificationCenterTest extends TestCase
{
    use InteractsWithNotifications;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpNotifications();
        Queue::fake();
    }

    public function test_guests_are_redirected_to_login(): void
    {
        $this->get('/account/notifications')->assertRedirect();
        $this->getJson('/account/notifications/unread-count')->assertUnauthorized();
    }

    public function test_member_sees_only_own_notifications_newest_first(): void
    {
        $member = $this->actingAsMember();
        $other = $this->makeMember();
        $old = Notification::factory()->create(['user_id' => $member->id, 'title' => 'Older', 'created_at' => now()->subDay()]);
        $new = Notification::factory()->create(['user_id' => $member->id, 'title' => 'Newer', 'created_at' => now()]);
        Notification::factory()->create(['user_id' => $other->id, 'title' => 'Not mine']);

        $this->get('/account/notifications')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('member/notifications/index')
                ->has('notifications.data', 2)
                ->where('notifications.data.0.id', $new->public_id)
                ->where('notifications.data.1.id', $old->public_id)
                ->where('unreadCount', 2)
                ->where('preferencesUrl', '/account/notification-preferences')
                ->where('unreadNotifications', 2)
                ->has('categories', 10));
    }

    public function test_category_and_unread_filters(): void
    {
        $member = $this->actingAsMember();
        Notification::factory()->category('orders')->create(['user_id' => $member->id]);
        Notification::factory()->category('orders')->read()->create(['user_id' => $member->id]);
        Notification::factory()->category('payments')->create(['user_id' => $member->id]);

        $this->get('/account/notifications?category=orders')
            ->assertInertia(fn (Assert $page) => $page->has('notifications.data', 2)->where('filters.category', 'orders'));
        $this->get('/account/notifications?category=orders&unread=1')
            ->assertInertia(fn (Assert $page) => $page->has('notifications.data', 1)->where('filters.unread', true));
        $this->get('/account/notifications?category=not-a-category')
            ->assertInertia(fn (Assert $page) => $page->has('notifications.data', 3)->where('filters.category', null));
    }

    public function test_pagination_is_server_side(): void
    {
        $member = $this->actingAsMember();
        Notification::factory()->count(25)->create(['user_id' => $member->id]);

        $this->get('/account/notifications?page=2')
            ->assertInertia(fn (Assert $page) => $page->has('notifications.data', 5)->where('notifications.current_page', 2)->where('notifications.total', 25));
    }

    public function test_member_marks_own_notification_read_and_is_redirected_to_its_link(): void
    {
        $member = $this->actingAsMember();
        $notification = Notify::send($member, 'orders.confirmed', ['order_number' => 'ORD-1'], 'orders', url: '/account/orders/01TEST');

        $this->from('/account/notifications')->post("/account/notifications/{$notification->public_id}/read", ['open' => true])
            ->assertRedirect('/account/orders/01TEST');

        $this->assertNotNull($notification->fresh()->read_at);
        $this->assertSame(DeliveryStatus::Read, NotificationDelivery::query()->where('notification_id', $notification->id)->where('channel', 'in_app')->first()->status);
        $this->getJson('/account/notifications/unread-count')->assertOk()->assertJsonPath('data.unread', 0);
    }

    public function test_external_links_use_an_inertia_location_visit(): void
    {
        $member = $this->actingAsMember();
        $notification = Notify::send($member, 'offers.new_offer', ['title' => 'Deal'], 'offers', url: 'https://partner.example.com/deal');

        $this->withHeaders(['X-Inertia' => 'true'])->post("/account/notifications/{$notification->public_id}/read", ['open' => true])
            ->assertStatus(409)
            ->assertHeader('X-Inertia-Location', 'https://partner.example.com/deal');
    }

    public function test_member_cannot_read_or_mark_another_members_notification(): void
    {
        $owner = $this->makeMember();
        $notification = Notification::factory()->create(['user_id' => $owner->id]);
        $this->actingAsMember();

        $this->post("/account/notifications/{$notification->public_id}/read")->assertNotFound();
        $this->postJson("/account/notifications/{$notification->public_id}/read")->assertNotFound();
        $this->assertNull($notification->fresh()->read_at);
    }

    public function test_mark_all_read_only_touches_own_notifications(): void
    {
        $member = $this->actingAsMember();
        $other = $this->makeMember();
        Notification::factory()->count(3)->create(['user_id' => $member->id]);
        $foreign = Notification::factory()->create(['user_id' => $other->id]);

        $this->postJson('/account/notifications/read-all')->assertOk()->assertJsonPath('data.updated', 3)->assertJsonPath('data.unread', 0);
        $this->from('/account/notifications')->post('/account/notifications/read-all')->assertRedirect('/account/notifications');

        $this->assertNull($foreign->fresh()->read_at);
        $this->assertSame(0, Notification::query()->where('user_id', $member->id)->whereNull('read_at')->count());
    }

    public function test_mark_all_read_can_be_limited_to_a_category(): void
    {
        $member = $this->actingAsMember();
        Notification::factory()->category('orders')->count(2)->create(['user_id' => $member->id]);
        Notification::factory()->category('payments')->create(['user_id' => $member->id]);

        $this->postJson('/account/notifications/read-all', ['category' => 'orders'])->assertJsonPath('data.updated', 2)->assertJsonPath('data.unread', 1);
    }

    public function test_unread_count_endpoint_is_personal_and_json(): void
    {
        $member = $this->actingAsMember();
        Notification::factory()->count(2)->create(['user_id' => $member->id]);
        Notification::factory()->create(['user_id' => $this->makeMember()->id]);

        $this->getJson('/account/notifications/unread-count')->assertOk()->assertExactJson(['data' => ['unread' => 2]]);
    }

    public function test_staff_inbox_and_partner_center_are_personal(): void
    {
        $staff = $this->actingAsStaff([]);
        $mine = Notification::factory()->create(['user_id' => $staff->id]);
        $memberNotification = Notification::factory()->create(['user_id' => $this->makeMember()->id]);

        $this->get('/admin/notifications/inbox')->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admin/notifications/inbox')->has('notifications.data', 1)->where('notifications.data.0.id', $mine->public_id)->where('preferencesUrl', null));
        $this->getJson('/admin/notifications/inbox/unread-count')->assertJsonPath('data.unread', 1);
        $this->post("/admin/notifications/inbox/{$memberNotification->public_id}/read")->assertNotFound();
        $this->postJson("/admin/notifications/inbox/{$mine->public_id}/read")->assertOk()->assertJsonPath('data.unread', 0);

        $partner = User::factory()->create();
        Permission::findOrCreate('partner.access', 'web');
        $partner->givePermissionTo('partner.access');
        $this->actingAs($partner);
        $partnerNotification = Notification::factory()->create(['user_id' => $partner->id]);

        $this->get('/partner/notifications')->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('partner/notifications/index')->has('notifications.data', 1));
        $this->post("/partner/notifications/{$mine->public_id}/read")->assertNotFound();
        $this->postJson("/partner/notifications/{$partnerNotification->public_id}/read")->assertOk();
        $this->postJson('/partner/notifications/read-all')->assertOk();
    }

    public function test_members_cannot_open_other_portals_notification_centers(): void
    {
        $this->actingAsMember();

        $this->get('/admin/notifications/inbox')->assertForbidden();
        $this->get('/partner/notifications')->assertForbidden();
    }
}
