<?php

namespace Tests\Feature\Notifications;

use App\Modules\Notifications\Jobs\SendEmailNotification;
use App\Modules\Notifications\Jobs\SendSmsNotification;
use App\Modules\Notifications\Mail\NotificationMail;
use App\Modules\Notifications\Models\Enums\DeliveryStatus;
use App\Modules\Notifications\Models\Enums\NotificationChannel;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Models\NotificationDelivery;
use App\Modules\Notifications\Models\NotificationPreference;
use App\Modules\Notifications\Services\NotificationPreferences;
use App\Modules\Notifications\Services\NotificationService;
use App\Modules\Notifications\Services\Notify;
use App\Modules\Reports\Operations\Models\OperationsException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use RuntimeException;
use Tests\Feature\Notifications\Support\FakeSmsProvider;
use Tests\Feature\Notifications\Support\FakeWhatsAppProvider;
use Tests\Feature\Notifications\Support\InteractsWithNotifications;
use Tests\TestCase;

class NotifyPipelineTest extends TestCase
{
    use InteractsWithNotifications;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpNotifications();
    }

    private function delivery(Notification $notification, NotificationChannel $channel): NotificationDelivery
    {
        return NotificationDelivery::query()->where('notification_id', $notification->id)->where('channel', $channel->value)->firstOrFail();
    }

    public function test_dedup_key_returns_the_existing_row_without_new_deliveries(): void
    {
        Queue::fake();
        $this->emailConfigured();
        $member = $this->makeMember();

        $first = Notify::send($member, 'orders.confirmed', ['order_number' => 'ORD-2026-000001', 'amount' => '100.00 EGP'], 'orders', dedupKey: 'orders.confirmed:1');
        $second = Notify::send($member, 'orders.confirmed', ['order_number' => 'ORD-2026-000001', 'amount' => '100.00 EGP'], 'orders', dedupKey: 'orders.confirmed:1');

        $this->assertNotNull($first);
        $this->assertTrue($first->is($second));
        $this->assertSame(1, Notification::query()->where('user_id', $member->id)->count());
        $this->assertSame(2, NotificationDelivery::query()->count()); // one in_app + one email, once
        Queue::assertPushed(SendEmailNotification::class, 1);
    }

    public function test_database_enforces_one_notification_per_user_and_dedup_key(): void
    {
        $member = $this->makeMember();
        $other = $this->makeMember();
        Notification::factory()->create(['user_id' => $member->id, 'dedup_key' => 'race:1']);
        Notification::factory()->create(['user_id' => $other->id, 'dedup_key' => 'race:1']); // other user: allowed
        Notification::factory()->count(2)->create(['user_id' => $member->id, 'dedup_key' => null]); // no key: allowed

        $this->expectException(UniqueConstraintViolationException::class);
        Notification::factory()->create(['user_id' => $member->id, 'dedup_key' => 'race:1']);
    }

    public function test_title_and_body_are_rendered_in_the_recipient_locale(): void
    {
        Queue::fake();
        $arabic = $this->makeMember(['preferred_locale' => 'ar']);
        $english = $this->makeMember(['preferred_locale' => 'en']);

        $ar = Notify::send($arabic, 'orders.confirmed', ['order_number' => 'ORD-2026-000009', 'amount' => '50.00'], 'orders');
        $en = Notify::send($english, 'orders.confirmed', ['order_number' => 'ORD-2026-000009', 'amount' => '50.00'], 'orders');

        $this->assertSame('تم تأكيد الطلب ORD-2026-000009', $ar?->title);
        $this->assertSame('Order ORD-2026-000009 confirmed', $en?->title);
        $this->assertStringContainsString('50.00', (string) $en?->body);
    }

    public function test_module_translation_keys_and_missing_placeholders(): void
    {
        Queue::fake();
        $member = $this->makeMember(['preferred_locale' => 'en']);

        $notification = Notify::send($member, 'members.status.suspended', ['member_number' => 'EV-000777', 'reason' => null], 'system');
        $this->assertSame('Your membership was suspended', $notification?->title);
        $this->assertSame('Your membership EV-000777 has been suspended.', $notification?->body);
        $this->assertStringNotContainsString(':reason', (string) $notification?->body);

        $custom = Notify::send($member, 'custom.thing', ['_title_key' => 'notifications.center.generic_title', '_body' => ['en' => 'Hello', 'ar' => 'مرحبا']], 'support');
        $this->assertSame('New notification', $custom?->title);
        $this->assertSame('Hello', $custom?->body);
        $this->assertArrayNotHasKey('_body', $custom?->data ?? []);
    }

    public function test_unsafe_urls_are_dropped_and_internal_paths_kept(): void
    {
        Queue::fake();
        $member = $this->makeMember();

        $this->assertSame('/account/orders/01ABC', Notify::send($member, 'system.generic', ['title' => 'a'], url: '/account/orders/01ABC')?->url);
        $this->assertNull(Notify::send($member, 'system.generic', ['title' => 'b'], url: 'javascript:alert(1)')?->url);
        $this->assertNull(Notify::send($member, 'system.generic', ['title' => 'c'], url: '//evil.example/x')?->url);
        $this->assertSame('https://example.com/offer', Notify::send($member, 'system.generic', ['title' => 'd'], url: 'https://example.com/offer')?->url);
        $this->assertSame('/admin/operations?severity=p0', Notify::send($member, 'system.generic', ['title' => 'e', 'url' => '/admin/operations?severity=p0'])?->url);
    }

    public function test_transactional_email_is_queued_when_email_is_configured(): void
    {
        Queue::fake();
        $this->emailConfigured();
        $member = $this->makeMember();

        $notification = Notify::send($member, 'payments.approved', ['amount' => '10.00', 'reference' => 'PAY-1'], 'payments');

        $this->assertSame(DeliveryStatus::Sent, $this->delivery($notification, NotificationChannel::InApp)->status);
        $email = $this->delivery($notification, NotificationChannel::Email);
        $this->assertSame(DeliveryStatus::Queued, $email->status);
        Queue::assertPushed(SendEmailNotification::class, fn (SendEmailNotification $job) => $job->deliveryId === $email->id);
    }

    public function test_email_is_skipped_when_not_configured(): void
    {
        Queue::fake();
        $this->emailConfigured(false);
        $member = $this->makeMember();

        $notification = Notify::send($member, 'payments.approved', ['amount' => '10.00', 'reference' => 'PAY-1'], 'payments');

        $email = $this->delivery($notification, NotificationChannel::Email);
        $this->assertSame(DeliveryStatus::Skipped, $email->status);
        $this->assertSame(NotificationDelivery::SKIP_NOT_CONFIGURED, $email->error);
        Queue::assertNothingPushed();
    }

    public function test_marketing_email_is_skipped_without_consent_and_queued_with_consent_and_preference(): void
    {
        Queue::fake();
        $this->emailConfigured();
        $member = $this->makeMember();

        $first = Notify::send($member, 'offers.new_offer', ['title' => 'Offer'], 'offers', transactional: false);
        $this->assertSame(NotificationDelivery::SKIP_PREFERENCE_DISABLED, $this->delivery($first, NotificationChannel::Email)->error);

        // Preference on but consent withdrawn elsewhere (e.g. privacy page): still skipped.
        NotificationPreference::query()->create(['user_id' => $member->id, 'category' => 'marketing', 'channel' => 'email', 'enabled' => true]);
        $second = Notify::send($member, 'offers.new_offer', ['title' => 'Offer 2'], 'offers', transactional: false);
        $this->assertSame(NotificationDelivery::SKIP_NO_CONSENT, $this->delivery($second, NotificationChannel::Email)->error);

        $this->grantConsent($member, NotificationChannel::Email);
        $third = Notify::send($member, 'offers.new_offer', ['title' => 'Offer 3'], 'offers', transactional: false);
        $this->assertSame(DeliveryStatus::Queued, $this->delivery($third, NotificationChannel::Email)->status);
        Queue::assertPushed(SendEmailNotification::class, 1);
    }

    public function test_opting_out_of_in_app_marketing_suppresses_the_notification(): void
    {
        Queue::fake();
        $member = $this->makeMember();
        NotificationPreferences::update($member, ['marketing' => ['in_app' => false]]);

        $this->assertNull(Notify::send($member, 'offers.new_offer', ['title' => 'Offer'], 'offers', transactional: false));
        $this->assertNotNull(Notify::send($member, 'orders.confirmed', ['order_number' => 'ORD-1'], 'orders'));
    }

    public function test_sms_is_skipped_when_the_provider_is_not_configured(): void
    {
        Queue::fake();
        $member = $this->makeMember();
        $this->grantConsent($member, NotificationChannel::Sms);

        $notification = Notify::send($member, 'pickup.ready', ['order_number' => 'ORD-1', 'location' => 'Cairo'], 'pickup', channels: ['in_app', 'sms', 'whatsapp']);

        $this->assertSame(NotificationDelivery::SKIP_NOT_CONFIGURED, $this->delivery($notification, NotificationChannel::Sms)->error);
        $this->assertSame(NotificationDelivery::SKIP_NOT_CONFIGURED, $this->delivery($notification, NotificationChannel::WhatsApp)->error);
        Queue::assertNothingPushed();
    }

    public function test_sms_requires_consent_even_for_transactional_notifications(): void
    {
        Queue::fake();
        $this->smsConfigured();
        $member = $this->makeMember();

        $withoutConsent = Notify::send($member, 'pickup.ready', ['order_number' => 'ORD-1', 'location' => 'Cairo'], 'pickup', channels: ['sms']);
        $this->assertSame(NotificationDelivery::SKIP_NO_CONSENT, $this->delivery($withoutConsent, NotificationChannel::Sms)->error);

        $this->grantConsent($member, NotificationChannel::Sms);
        NotificationPreferences::update($member, ['pickup' => ['sms' => false]]);
        $preferenceOff = Notify::send($member, 'pickup.ready', ['order_number' => 'ORD-2', 'location' => 'Cairo'], 'pickup', channels: ['sms']);
        $this->assertSame(NotificationDelivery::SKIP_PREFERENCE_DISABLED, $this->delivery($preferenceOff, NotificationChannel::Sms)->error);

        NotificationPreferences::update($member, ['pickup' => ['sms' => true]]);
        $allowed = Notify::send($member, 'pickup.ready', ['order_number' => 'ORD-3', 'location' => 'Cairo'], 'pickup', channels: ['sms']);
        $this->assertSame(DeliveryStatus::Queued, $this->delivery($allowed, NotificationChannel::Sms)->status);
        Queue::assertPushed(SendSmsNotification::class, 1);
    }

    public function test_sms_and_whatsapp_jobs_send_through_the_provider(): void
    {
        $this->smsConfigured();
        $this->whatsappConfigured();
        $member = $this->makeMember(['preferred_locale' => 'en']);
        $this->grantConsent($member, NotificationChannel::Sms);
        $this->grantConsent($member, NotificationChannel::WhatsApp);

        // QUEUE_CONNECTION=sync: the jobs run right after the notification is committed.
        $notification = Notify::send($member, 'pickup.ready', ['order_number' => 'ORD-7', 'location' => 'Cairo'], 'pickup', url: '/account/orders/X', channels: ['sms', 'whatsapp']);

        $sms = $this->delivery($notification, NotificationChannel::Sms);
        $this->assertSame(DeliveryStatus::Sent, $sms->status);
        $this->assertSame('fake-1', $sms->provider_message_id);
        $this->assertSame(1, $sms->attempts);
        $this->assertCount(1, FakeSmsProvider::$sent);
        $this->assertSame($member->mobile, FakeSmsProvider::$sent[0]->to);
        $this->assertStringContainsString('ORD-7', FakeSmsProvider::$sent[0]->body);
        $this->assertStringContainsString('/account/orders/X', FakeSmsProvider::$sent[0]->body);

        $this->assertSame(DeliveryStatus::Sent, $this->delivery($notification, NotificationChannel::WhatsApp)->status);
        $this->assertCount(1, FakeWhatsAppProvider::$sent);
    }

    public function test_email_job_sends_the_bilingual_mail_and_marks_the_delivery_sent(): void
    {
        Mail::fake();
        $this->emailConfigured();
        $member = $this->makeMember(['preferred_locale' => 'ar']);

        $notification = Notify::send($member, 'orders.confirmed', ['order_number' => 'ORD-2026-000123', 'amount' => '99.00 & fees'], 'orders', url: '/account/orders/abc');

        $email = $this->delivery($notification, NotificationChannel::Email);
        $this->assertSame(DeliveryStatus::Sent, $email->status);
        Mail::assertSent(NotificationMail::class, function (NotificationMail $mail) use ($member) {
            $this->assertTrue($mail->hasTo($member->email));
            $html = $mail->render();
            $this->assertStringContainsString('dir="rtl"', $html);
            $this->assertStringContainsString('ORD-2026-000123', $html);
            $this->assertStringContainsString('/account/orders/abc', $html);
            $mail->assertSeeInText('ORD-2026-000123', false);
            $mail->assertSeeInText('/account/notification-preferences', false);
            $mail->assertDontSeeInText('&amp;', false);

            return $mail->mailLocale === 'ar';
        });
    }

    public function test_email_job_rechecks_rules_before_sending(): void
    {
        Queue::fake();
        Mail::fake();
        $this->emailConfigured();
        $member = $this->makeMember();
        $notification = Notify::send($member, 'orders.confirmed', ['order_number' => 'ORD-1'], 'orders');
        $email = $this->delivery($notification, NotificationChannel::Email);

        // The provider was disconnected between queueing and sending.
        $this->emailConfigured(false);
        app()->call([new SendEmailNotification($email->id), 'handle']);

        $this->assertSame(DeliveryStatus::Skipped, $email->fresh()->status);
        $this->assertSame(NotificationDelivery::SKIP_NOT_CONFIGURED, $email->fresh()->error);
        Mail::assertNothingSent();

        // A job for an already processed delivery is a no-op (duplicate / late retry).
        app()->call([new SendEmailNotification($email->id), 'handle']);
        $this->assertSame(0, $email->fresh()->attempts);
    }

    public function test_final_failure_marks_the_delivery_failed_and_raises_an_operations_exception(): void
    {
        Queue::fake();
        $this->smsConfigured();
        $member = $this->makeMember();
        $this->grantConsent($member, NotificationChannel::Sms);
        $notification = Notify::send($member, 'pickup.ready', ['order_number' => 'ORD-9'], 'pickup', channels: ['sms']);
        $sms = $this->delivery($notification, NotificationChannel::Sms);

        FakeSmsProvider::$failWith = 'Gateway rejected the number';
        $job = new SendSmsNotification($sms->id);
        $this->assertSame([30, 120, 600], $job->backoff());
        $this->assertSame(3, $job->tries);
        try {
            app()->call([$job, 'handle']);
            $this->fail('The provider failure must be rethrown so the queue retries.');
        } catch (RuntimeException $e) {
            $this->assertSame('Gateway rejected the number', $e->getMessage());
        }
        $this->assertSame(DeliveryStatus::Queued, $sms->fresh()->status); // still retryable
        $this->assertSame(1, $sms->fresh()->attempts);

        $job->failed(new RuntimeException('Gateway rejected the number'));

        $this->assertSame(DeliveryStatus::Failed, $sms->fresh()->status);
        $this->assertSame('Gateway rejected the number', $sms->fresh()->error);
        $exception = OperationsException::query()->where('dedup_key', 'notifications:delivery_failed:sms')->first();
        $this->assertNotNull($exception);
        $this->assertSame('notifications', $exception->category->value);
    }

    public function test_unread_count_is_cached_and_invalidated_on_writes(): void
    {
        Queue::fake();
        $member = $this->makeMember();
        $service = app(NotificationService::class);

        $this->assertSame(0, $service->unreadCount($member));
        $first = Notify::send($member, 'system.generic', ['title' => 'One']);
        Notify::send($member, 'system.generic', ['title' => 'Two']);
        $this->assertSame(2, $service->unreadCount($member));

        // A write that bypasses the service is not visible until the cache expires (60 s).
        Notification::factory()->create(['user_id' => $member->id]);
        $this->assertSame(2, $service->unreadCount($member));

        $service->markRead($member, $first);
        $this->assertSame(2, $service->unreadCount($member));
        $this->assertSame(DeliveryStatus::Read, $this->delivery($first, NotificationChannel::InApp)->status);

        $this->assertSame(2, $service->markAllRead($member));
        $this->assertSame(0, $service->unreadCount($member));
    }

    public function test_send_many_chunks_and_counts(): void
    {
        Queue::fake();
        $members = collect(range(1, 3))->map(fn () => $this->makeMember());

        $count = Notify::sendMany($members, 'system.generic', ['title' => 'Hi'], 'system', dedupKey: 'bulk:1');
        $again = Notify::sendMany($members, 'system.generic', ['title' => 'Hi'], 'system', dedupKey: 'bulk:1');

        $this->assertSame(3, $count);
        $this->assertSame(3, $again);
        $this->assertSame(3, Notification::query()->where('dedup_key', 'bulk:1')->count());
    }

    public function test_notification_rolled_back_with_the_callers_transaction_dispatches_nothing(): void
    {
        // Real (sync) queue: afterCommit jobs are discarded when the caller's transaction rolls back.
        Mail::fake();
        $this->emailConfigured();
        $member = $this->makeMember();

        try {
            DB::transaction(function () use ($member) {
                Notify::send($member, 'orders.confirmed', ['order_number' => 'ORD-1'], 'orders');
                throw new RuntimeException('business rule failed');
            });
        } catch (RuntimeException) {
        }

        $this->assertSame(0, Notification::query()->where('user_id', $member->id)->count());
        $this->assertSame(0, NotificationDelivery::query()->count());
        Mail::assertNothingSent();

        DB::transaction(fn () => Notify::send($member, 'orders.confirmed', ['order_number' => 'ORD-2'], 'orders'));
        Mail::assertSent(NotificationMail::class, 1);
    }
}
