<?php

namespace Tests\Feature\Integrations;

use App\Modules\Integrations\Jobs\ProcessWebhookEventJob;
use App\Modules\Integrations\Models\Enums\WebhookEventStatus;
use App\Modules\Integrations\Models\WebhookEvent;
use App\Modules\Integrations\Services\Integrations;
use App\Modules\Integrations\Services\WebhookHandlers;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;
use RuntimeException;
use Tests\Feature\Integrations\Support\FakePaymentProvider;
use Tests\TestCase;

class WebhookTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        WebhookHandlers::reset();
        Integrations::extend('payment', 'fake', FakePaymentProvider::class);
        config(['ev.integrations.payment.driver' => 'fake']);
        Integrations::manager()->forget('payment');
    }

    protected function tearDown(): void
    {
        WebhookHandlers::reset();
        parent::tearDown();
    }

    private function postWebhook(array $payload, bool $validSignature = true, string $provider = 'payment'): TestResponse
    {
        $raw = json_encode($payload, JSON_UNESCAPED_UNICODE);
        $signature = $validSignature ? FakePaymentProvider::sign($raw) : 'bad-signature';

        return $this->call('POST', '/webhooks/'.$provider, [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json', 'HTTP_X_SIGNATURE' => $signature], $raw);
    }

    private function payload(string $id = 'evt_1'): array
    {
        return ['id' => $id, 'type' => 'transaction.processed', 'transaction' => 'trx_9', 'reference' => 'PAY-2026-000001', 'status' => 'paid', 'amount' => '1500.00', 'currency' => 'EGP', 'api_key' => 'should-be-redacted'];
    }

    public function test_same_event_id_twice_stores_one_row_and_queues_one_job(): void
    {
        Queue::fake();

        $first = $this->postWebhook($this->payload('evt_1'));
        $second = $this->postWebhook($this->payload('evt_1'));

        $first->assertOk()->assertJson(['received' => true, 'duplicate' => false]);
        $second->assertOk()->assertJson(['received' => true, 'duplicate' => true]);
        $this->assertSame(1, WebhookEvent::query()->count());
        Queue::assertPushed(ProcessWebhookEventJob::class, 1);

        $event = WebhookEvent::query()->first();
        $this->assertSame('payment', $event->provider);
        $this->assertSame('evt_1', $event->external_event_id);
        $this->assertSame('transaction.processed', $event->event_type);
        $this->assertTrue($event->signature_valid);
        $this->assertSame(WebhookEventStatus::Received, $event->status);
        $this->assertSame('[redacted]', $event->payload['api_key'], 'secrets are redacted before storage');
        $this->assertSame('[redacted]', $event->headers['x-signature']);
        $this->assertSame('fake', $event->headers['_driver']);
    }

    public function test_invalid_signature_is_stored_as_ignored_and_rejected_with_401(): void
    {
        Queue::fake();

        $this->postWebhook($this->payload('evt_bad'), validSignature: false)->assertStatus(401)->assertJson(['received' => false]);

        $event = WebhookEvent::query()->sole();
        $this->assertFalse($event->signature_valid);
        $this->assertSame(WebhookEventStatus::Ignored, $event->status);
        $this->assertNull($event->external_event_id, 'identity is not trusted from an unverified payload');
        Queue::assertNothingPushed();
        $this->assertDatabaseHas('integration_events', ['provider' => 'payment', 'operation' => 'webhook.received', 'status' => 'failed']);

        // Replaying the same forged body stays rejected (no duplicate acceptance).
        $this->postWebhook($this->payload('evt_bad'), validSignature: false)->assertStatus(401);
        $this->assertSame(1, WebhookEvent::query()->count());
    }

    public function test_verified_events_are_processed_by_the_registered_handler(): void
    {
        $seen = [];
        WebhookHandlers::register('payment', function (WebhookEvent $event) use (&$seen) {
            $parsed = Integrations::payment()->parseWebhook($event->asRequest());
            $seen[] = [$event->external_event_id, $parsed->providerRef, $parsed->state->value];
        });

        $this->postWebhook($this->payload('evt_2'))->assertOk(); // QUEUE_CONNECTION=sync runs the job inline

        $event = WebhookEvent::query()->sole();
        $this->assertSame(WebhookEventStatus::Processed, $event->status);
        $this->assertNotNull($event->processed_at);
        $this->assertSame([['evt_2', 'trx_9', 'paid']], $seen);
        $this->assertDatabaseHas('integration_events', ['provider' => 'payment', 'operation' => 'webhook.process', 'status' => 'success', 'reference' => 'evt_2']);
    }

    public function test_missing_handler_marks_the_event_failed_without_retrying(): void
    {
        Queue::fake();
        $this->postWebhook($this->payload('evt_3'))->assertOk();
        $event = WebhookEvent::query()->sole();

        (new ProcessWebhookEventJob($event->id))->handle(); // must not throw

        $event->refresh();
        $this->assertSame(WebhookEventStatus::Failed, $event->status);
        $this->assertSame(1, $event->retry_count);
        $this->assertStringContainsString('payment', (string) $event->error);
    }

    public function test_failed_event_can_be_retried_from_the_admin_and_becomes_processed(): void
    {
        Queue::fake();
        $this->postWebhook($this->payload('evt_4'))->assertOk();
        $event = WebhookEvent::query()->sole();

        WebhookHandlers::register('payment', fn () => throw new RuntimeException('gateway model missing'));
        try {
            (new ProcessWebhookEventJob($event->id))->handle();
            $this->fail('handler failures must propagate so the queue can retry');
        } catch (RuntimeException) {
        }
        $event->refresh();
        $this->assertSame(WebhookEventStatus::Failed, $event->status);
        $this->assertStringContainsString('gateway model missing', (string) $event->error);

        // A deploy fixes the handler; the admin retries the event.
        WebhookHandlers::reset();
        WebhookHandlers::register('payment', fn () => null);
        $this->actingAsStaff(['integrations.view', 'integrations.manage']);
        $this->post(route('admin.integrations.webhook-events.retry', $event))->assertRedirect()->assertSessionHas('success');

        Queue::assertPushed(ProcessWebhookEventJob::class, 2);
        $this->assertSame(WebhookEventStatus::Received, $event->refresh()->status);
        (new ProcessWebhookEventJob($event->id))->handle();
        $this->assertSame(WebhookEventStatus::Processed, $event->refresh()->status);
        $this->assertNull($event->error);
        $this->assertDatabaseHas('audit_logs', ['action' => 'integrations.webhook_retried', 'entity_id' => $event->id]);
    }

    public function test_processed_and_ignored_events_cannot_be_retried(): void
    {
        $this->actingAsStaff(['integrations.view', 'integrations.manage']);
        $processed = WebhookEvent::factory()->processed()->create();
        $ignored = WebhookEvent::factory()->ignored()->create(['fingerprint' => str_repeat('b', 64)]);

        $this->from('/admin/integrations/webhook-events')->post(route('admin.integrations.webhook-events.retry', $processed))->assertSessionHasErrors('domain');
        $this->from('/admin/integrations/webhook-events')->post(route('admin.integrations.webhook-events.retry', $ignored))->assertSessionHasErrors('domain');
        $this->assertSame(WebhookEventStatus::Processed, $processed->refresh()->status);
    }

    public function test_unknown_or_unconfigured_providers_answer_404_without_storing_anything(): void
    {
        $this->postWebhook($this->payload(), provider: 'charging')->assertNotFound();
        $this->postWebhook($this->payload(), provider: 'shipping')->assertNotFound(); // manual shipping: no webhooks
        $this->postWebhook($this->payload(), provider: 'nope')->assertNotFound();
        $this->assertSame(0, WebhookEvent::query()->count());
    }

    public function test_admin_viewer_can_list_filter_and_open_events_but_needs_manage_to_retry(): void
    {
        WebhookEvent::factory()->create(['external_event_id' => 'evt_list_1', 'fingerprint' => str_repeat('1', 64)]);
        WebhookEvent::factory()->failed()->create(['external_event_id' => 'evt_list_2', 'fingerprint' => str_repeat('2', 64)]);
        $failed = WebhookEvent::query()->where('external_event_id', 'evt_list_2')->sole();

        $this->actingAsStaff(['integrations.view']);
        $this->get(route('admin.integrations.webhook-events.index', ['status' => 'failed']))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admin/integrations/webhook-events/index')
                ->has('events.data', 1)
                ->where('events.data.0.external_event_id', 'evt_list_2')
                ->where('filters.status', 'failed')
                ->where('canManage', false));
        $this->get(route('admin.integrations.webhook-events.show', $failed))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admin/integrations/webhook-events/show')->where('event.id', $failed->id)->has('event.payload'));

        $this->post(route('admin.integrations.webhook-events.retry', $failed))->assertForbidden();
    }

    public function test_staff_without_permission_cannot_see_webhook_events(): void
    {
        $this->actingAsStaff([]);
        $this->get(route('admin.integrations.webhook-events.index'))->assertForbidden();
    }
}
