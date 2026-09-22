<?php

namespace Tests\Feature\Integrations;

use App\Modules\Integrations\Contracts\Data\HealthStatus;
use App\Modules\Integrations\Contracts\Data\SendStatus;
use App\Modules\Integrations\Drivers\Email\LaravelMailEmailProvider;
use App\Modules\Integrations\Exceptions\IntegrationNotConfiguredException;
use App\Modules\Integrations\Jobs\SendTestEmailJob;
use App\Modules\Integrations\Mail\IntegrationTestMail;
use App\Modules\Integrations\Services\Integrations;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class EmailProviderTest extends TestCase
{
    use RefreshDatabase;

    public function test_log_and_array_mailers_are_not_configured(): void
    {
        foreach (['log', 'array'] as $mailer) {
            config(['mail.default' => $mailer]);
            $provider = new LaravelMailEmailProvider;
            $this->assertFalse($provider->isConfigured(), $mailer);
            $this->assertSame(HealthStatus::NotConfigured, $provider->healthCheck()->status);
            $this->assertSame($mailer, $provider->driver());
        }
    }

    public function test_force_configured_override_marks_email_as_operational(): void
    {
        config(['ev.integrations.email.force_configured' => true]);
        Integrations::manager()->forget('email');

        $this->assertTrue(Integrations::isConfigured('email'));
        $this->assertSame(HealthStatus::Operational, Integrations::check('email')->status);
    }

    public function test_smtp_with_a_host_counts_as_configured_outside_production(): void
    {
        config(['mail.default' => 'smtp', 'mail.mailers.smtp.host' => 'mail.example.com', 'mail.mailers.smtp.port' => 587, 'mail.mailers.smtp.username' => null]);
        $this->assertTrue((new LaravelMailEmailProvider)->isConfigured());

        config(['mail.mailers.smtp.host' => '']);
        $this->assertFalse((new LaravelMailEmailProvider)->isConfigured());
    }

    public function test_failover_mailer_is_configured_only_when_a_real_child_is(): void
    {
        config(['mail.default' => 'failover', 'mail.mailers.failover.mailers' => ['log', 'array']]);
        $this->assertFalse((new LaravelMailEmailProvider)->isConfigured());

        config(['mail.mailers.failover.mailers' => ['smtp', 'log'], 'mail.mailers.smtp.host' => 'mail.example.com', 'mail.mailers.smtp.port' => 587]);
        $this->assertTrue((new LaravelMailEmailProvider)->isConfigured());
    }

    public function test_send_test_throws_when_not_configured_and_sends_when_configured(): void
    {
        Mail::fake();
        try {
            Integrations::email()->sendTest('me@example.com');
            $this->fail('expected IntegrationNotConfiguredException');
        } catch (IntegrationNotConfiguredException $e) {
            $this->assertSame('email', $e->integration);
        }
        Mail::assertNothingSent();

        config(['ev.integrations.email.force_configured' => true]);
        Integrations::manager()->forget('email');
        $result = Integrations::email()->sendTest('me@example.com');

        $this->assertSame(SendStatus::Sent, $result->status);
        Mail::assertSent(IntegrationTestMail::class, fn (IntegrationTestMail $mail) => $mail->hasTo('me@example.com'));
        $this->assertDatabaseHas('integration_events', ['provider' => 'email', 'operation' => 'send_test', 'status' => 'success']);
    }

    public function test_admin_test_email_button_reports_not_configured_instead_of_pretending(): void
    {
        Queue::fake();
        $this->actingAsStaff(['integrations.view', 'integrations.manage']);

        $this->from(route('admin.integrations.index'))->post(route('admin.integrations.test-email'))
            ->assertRedirect(route('admin.integrations.index'))
            ->assertSessionHas('warning');
        Queue::assertNothingPushed();
    }

    public function test_admin_test_email_button_queues_the_job_when_configured(): void
    {
        Queue::fake();
        config(['ev.integrations.email.force_configured' => true]);
        Integrations::manager()->forget('email');
        $user = $this->actingAsStaff(['integrations.view', 'integrations.manage']);

        $this->post(route('admin.integrations.test-email'))->assertRedirect()->assertSessionHas('success');
        Queue::assertPushed(SendTestEmailJob::class, fn (SendTestEmailJob $job) => $job->userId === $user->id);

        $this->actingAsStaff(['integrations.view']);
        $this->post(route('admin.integrations.test-email'))->assertForbidden();
    }
}
