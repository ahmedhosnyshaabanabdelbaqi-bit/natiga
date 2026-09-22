<?php

namespace Tests\Feature\Integrations;

use App\Modules\Integrations\Jobs\ProcessWebhookEventJob;
use App\Modules\Integrations\Models\Enums\WebhookEventStatus;
use App\Modules\Integrations\Models\WebhookEvent;
use App\Modules\Integrations\Services\Integrations;
use App\Modules\Integrations\Services\WebhookHandlers;
use App\Modules\Integrations\Services\WebhookIngest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
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

    public function test_a_redelivery_requeues_an_event_that_was_stored_but_never_picked_up(): void
    {
        Queue::fake();
        // First delivery stored the event but its job never ran (queue unreachable → provider got a 5xx).
        $this->postWebhook($this->payload('evt_lost'))->assertOk();
        Queue::assertPushed(ProcessWebhookEventJob::class, 1);

        // A quick duplicate while the job is still queued does not queue another one.
        $this->postWebhook($this->payload('evt_lost'))->assertOk()->assertJson(['duplicate' => true]);
        Queue::assertPushed(ProcessWebhookEventJob::class, 1);

        // The provider's later redelivery re-queues the stale `received` event.
        $this->travel(WebhookIngest::STALE_RECEIVED_MINUTES + 1)->minutes();
        $this->postWebhook($this->payload('evt_lost'))->assertOk()->assertJson(['duplicate' => true]);
        Queue::assertPushed(ProcessWebhookEventJob::class, 2);
        $this->assertSame(1, WebhookEvent::query()->count());

        // Once processed, redeliveries never queue it again.
        WebhookEvent::query()->sole()->forceFill(['status' => WebhookEventStatus::Processed])->save();
        $this->postWebhook($this->payload('evt_lost'))->assertOk();
        Queue::assertPushed(ProcessWebhookEventJob::class, 2);
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

    public function test_an_event_left_in_processing_by_a_dead_worker_is_reclaimed_on_redelivery(): void
    {
        $calls = 0;
        WebhookHandlers::register('payment', function () use (&$calls) {
            $calls++;
        });
        // The worker that claimed the event was killed (timeout / OOM / deploy): status stuck in
        // `processing`, its lock expired. The queue redelivers the job.
        $event = WebhookEvent::factory()->create(['status' => WebhookEventStatus::Processing]);

        (new ProcessWebhookEventJob($event->id))->handle();

        $this->assertSame(1, $calls);
        $this->assertSame(WebhookEventStatus::Processed, $event->refresh()->status);
        $this->assertTrue(Cache::lock(ProcessWebhookEventJob::lockKey($event->id), 5)->get(), 'the event lock is released after processing');
    }

    public function test_an_event_held_by_a_live_worker_is_not_processed_twice(): void
    {
        $calls = 0;
        WebhookHandlers::register('payment', function () use (&$calls) {
            $calls++;
        });
        $event = WebhookEvent::factory()->create(['status' => WebhookEventStatus::Processing]);
        $held = Cache::lock(ProcessWebhookEventJob::lockKey($event->id), ProcessWebhookEventJob::LOCK_SECONDS);
        $this->assertTrue($held->get(), 'another worker is processing the event');

        (new ProcessWebhookEventJob($event->id))->handle();

        $this->assertSame(0, $calls);
        $this->assertSame(WebhookEventStatus::Processing, $event->refresh()->status);

        // Once the other worker is gone the next delivery processes it exactly once.
        $held->release();
        (new ProcessWebhookEventJob($event->id))->handle();
        (new ProcessWebhookEventJob($event->id))->handle();
        $this->assertSame(1, $calls);
        $this->assertSame(WebhookEventStatus::Processed, $event->refresh()->status);
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
        $event = WebhookEvent::factory()->failed()->create();

        $this->actingAsStaff([]);
        $this->get(route('admin.integrations.webhook-events.index'))->assertForbidden();
        $this->get(route('admin.integrations.webhook-events.show', $event))->assertForbidden();
        $this->post(route('admin.integrations.webhook-events.retry', $event))->assertForbidden();
        $this->assertSame(WebhookEventStatus::Failed, $event->refresh()->status);
    }

    public function test_unknown_event_ids_answer_404(): void
    {
        $this->actingAsStaff(['integrations.view', 'integrations.manage']);

        $this->get('/admin/integrations/webhook-events/999999')->assertNotFound();
        $this->post('/admin/integrations/webhook-events/999999/retry')->assertNotFound();
        $this->get('/admin/integrations/webhook-events/not-a-number')->assertNotFound();
    }

    public function test_forged_request_cannot_preempt_a_legitimate_event_with_the_same_body(): void
    {
        Queue::fake();
        // A provider that sends no event id: the fingerprint falls back to the raw body.
        $payload = ['type' => 'transaction.processed', 'transaction' => 'trx_77', 'status' => 'paid'];

        $this->postWebhook($payload, validSignature: false)->assertStatus(401);
        $this->postWebhook($payload)->assertOk()->assertJson(['received' => true, 'duplicate' => false]);
        $this->postWebhook($payload)->assertOk()->assertJson(['duplicate' => true]);

        $this->assertSame(2, WebhookEvent::query()->count());
        $this->assertSame(1, WebhookEvent::query()->where('signature_valid', true)->count());
        Queue::assertPushed(ProcessWebhookEventJob::class, 1);
    }

    public function test_concurrent_retries_requeue_a_failed_event_only_once(): void
    {
        Queue::fake();
        $event = WebhookEvent::factory()->failed()->create();
        // Two admins loaded the page while the event was failed (stale in-memory models).
        $first = WebhookEvent::query()->findOrFail($event->id);
        $second = WebhookEvent::query()->findOrFail($event->id);
        $ingest = app(WebhookIngest::class);

        $this->assertTrue($ingest->retry($first));
        $this->assertFalse($ingest->retry($second), 'the row lock re-reads the status: already re-queued');
        Queue::assertPushed(ProcessWebhookEventJob::class, 1);

        // Same through HTTP: the second click is refused and not audited twice.
        $failed = WebhookEvent::factory()->failed()->create(['fingerprint' => str_repeat('c', 64)]);
        $this->actingAsStaff(['integrations.view', 'integrations.manage']);
        $this->from('/admin/integrations/webhook-events')->post(route('admin.integrations.webhook-events.retry', $failed))->assertSessionHas('success');
        $this->from('/admin/integrations/webhook-events')->post(route('admin.integrations.webhook-events.retry', $failed))->assertSessionHasErrors('domain');
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'integrations.webhook_retried')->where('entity_id', $failed->id)->count());
        Queue::assertPushed(ProcessWebhookEventJob::class, 2);
    }

    public function test_events_with_an_invalid_signature_can_never_be_retried(): void
    {
        Queue::fake();
        $forged = WebhookEvent::factory()->failed()->create(['signature_valid' => false]);

        $this->assertFalse(app(WebhookIngest::class)->retry($forged));
        Queue::assertNothingPushed();
    }

    public function test_index_loads_the_selected_event_for_the_detail_drawer(): void
    {
        $event = WebhookEvent::factory()->failed()->create(['payload' => ['id' => 'evt_d', 'amount' => '10.00']]);
        $this->actingAsStaff(['integrations.view']);

        $this->get(route('admin.integrations.webhook-events.index', ['event' => $event->id]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admin/integrations/webhook-events/index')
                ->where('selected.id', $event->id)
                ->where('selected.payload.amount', '10.00')
                ->where('selected.has_handler', false)
                ->has('selected.fingerprint')
                ->where('selected.can_retry', true));

        $this->get(route('admin.integrations.webhook-events.index', ['event' => 999999]))
            ->assertInertia(fn (Assert $page) => $page->where('selected', null));
        $this->get(route('admin.integrations.webhook-events.index', ['event' => 'x;drop']))
            ->assertInertia(fn (Assert $page) => $page->where('selected', null));
    }

    public function test_payload_and_headers_are_redacted_again_when_displayed(): void
    {
        // A row stored before a Sanitizer rule existed (raw secret in the payload).
        $event = WebhookEvent::factory()->create([
            'payload' => ['id' => 'evt_old', 'nested' => ['access_token' => 'tok_live_123'], 'amount' => '5.00'],
            'headers' => ['authorization' => 'Bearer abc', 'content-type' => 'application/json', '_driver' => 'fake'],
        ]);
        $this->actingAsStaff(['integrations.view']);

        $this->get(route('admin.integrations.webhook-events.show', $event))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admin/integrations/webhook-events/show')
                ->where('event.payload.nested.access_token', '[redacted]')
                ->where('event.payload.amount', '5.00')
                ->where('event.headers.authorization', '[redacted]')
                ->where('event.headers.content-type', 'application/json')
                ->missing('event.headers._driver')
                ->where('event.driver', 'fake')
                ->where('canManage', false));
    }

    public function test_search_treats_like_wildcards_literally(): void
    {
        WebhookEvent::factory()->create(['external_event_id' => 'evt_alpha', 'fingerprint' => str_repeat('d', 64)]);
        WebhookEvent::factory()->create(['external_event_id' => 'evt_50%_off', 'fingerprint' => str_repeat('e', 64)]);
        $this->actingAsStaff(['integrations.view']);

        $this->get(route('admin.integrations.webhook-events.index', ['q' => '%']))
            ->assertInertia(fn (Assert $page) => $page->has('events.data', 1)->where('events.data.0.external_event_id', 'evt_50%_off'));
        $this->get(route('admin.integrations.webhook-events.index', ['q' => 'ALPHA']))
            ->assertInertia(fn (Assert $page) => $page->has('events.data', 1));
        $this->get(route('admin.integrations.webhook-events.index', ['provider' => 'nope', 'status' => 'bogus']))
            ->assertInertia(fn (Assert $page) => $page->where('filters.provider', null)->where('filters.status', null)->has('events.data', 2));
    }
}
