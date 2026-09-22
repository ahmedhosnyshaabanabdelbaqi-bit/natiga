<?php

namespace Tests\Feature\Notifications;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\Notifications\Mail\NotificationMail;
use App\Modules\Notifications\Models\EmailTemplate;
use App\Modules\Notifications\Services\Notify;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Feature\Notifications\Support\InteractsWithNotifications;
use Tests\TestCase;

class EmailTemplatesTest extends TestCase
{
    use InteractsWithNotifications;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpNotifications();
    }

    public function test_list_shows_lang_defaults_and_nested_keys(): void
    {
        $this->actingAsStaff(['notifications.view']);

        $this->get('/admin/notifications/templates')->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admin/notifications/templates/index')
                ->where('canManage', false)
                ->where('templates', fn ($rows) => collect($rows)->pluck('key')->contains('orders.confirmed') && collect($rows)->pluck('key')->contains('members.status.active')));

        $this->get('/admin/notifications/templates?state=customized')
            ->assertInertia(fn (Assert $page) => $page->has('templates', 0));
        $this->get('/admin/notifications/templates/orders.confirmed/edit')->assertForbidden();
    }

    public function test_permission_is_required(): void
    {
        $this->actingAsStaff([]);
        $this->get('/admin/notifications/templates')->assertForbidden();
        $this->put('/admin/notifications/templates/orders.confirmed', ['subject_en' => 'x'])->assertForbidden();
    }

    public function test_edit_update_reset_with_audit(): void
    {
        $this->actingAsStaff(['notifications.manage']);

        $this->get('/admin/notifications/templates/orders.confirmed/edit')->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admin/notifications/templates/edit')
                ->where('template.key', 'orders.confirmed')
                ->where('template.customized', false)
                ->where('template.defaults.en.subject', 'Order :order_number confirmed')
                ->where('template.variables', fn ($vars) => collect($vars)->contains('order_number') && collect($vars)->contains('member_name')));

        $this->put('/admin/notifications/templates/orders.confirmed', [
            'subject_en' => 'Your order {{order_number}} is confirmed',
            'body_en' => "Hi {{member_name}},\n\n**Thanks!** See [your order]({{url}}).",
        ])->assertRedirect('/admin/notifications/templates/orders.confirmed/edit')->assertSessionHasNoErrors();

        $template = EmailTemplate::query()->where('key', 'orders.confirmed')->firstOrFail();
        $this->assertSame('Your order {{order_number}} is confirmed', $template->subject_en);
        $this->assertNull($template->subject_ar);
        $this->assertTrue(AuditLog::query()->where('action', 'notifications.template_updated')->exists());

        $this->delete('/admin/notifications/templates/orders.confirmed')->assertRedirect();
        $this->assertSame(0, EmailTemplate::query()->count());
        $this->assertTrue(AuditLog::query()->where('action', 'notifications.template_reset')->where('entity_label', 'orders.confirmed')->exists());
    }

    public function test_html_script_and_unknown_variables_are_rejected(): void
    {
        $this->actingAsStaff(['notifications.manage']);

        $this->put('/admin/notifications/templates/orders.confirmed', ['body_en' => 'Hello <script>alert(1)</script>'])->assertSessionHasErrors('body_en');
        $this->put('/admin/notifications/templates/orders.confirmed', ['body_ar' => '<b>مرحبا</b>'])->assertSessionHasErrors('body_ar');
        $this->put('/admin/notifications/templates/orders.confirmed', ['body_en' => '[x](javascript:alert(1))'])->assertSessionHasErrors('body_en');
        $this->put('/admin/notifications/templates/orders.confirmed', ['subject_en' => 'Hi {{password}}'])->assertSessionHasErrors('subject_en');
        $this->put('/admin/notifications/templates/does.not.exist', ['subject_en' => 'x'])->assertNotFound();
        $this->assertSame(0, EmailTemplate::query()->count());
    }

    public function test_preview_uses_sample_data_and_escapes(): void
    {
        $this->actingAsStaff(['notifications.manage']);

        $this->postJson('/admin/notifications/templates/orders.confirmed/preview', ['body_en' => 'Order {{order_number}} for {{member_name}} **now**', 'subject_en' => ''])
            ->assertOk()
            ->assertJsonPath('data.en.subject', 'Order ORD-2026-000045 confirmed')
            ->assertJsonPath('data.en.html', '<p>Order ORD-2026-000045 for Ahmed Mohamed <strong>now</strong></p>')
            ->assertJsonPath('data.ar.subject', 'تم تأكيد الطلب ORD-2026-000045');
    }

    public function test_admin_override_is_used_for_the_real_email_and_values_are_escaped(): void
    {
        Mail::fake();
        $this->emailConfigured();
        EmailTemplate::query()->create(['key' => 'orders.confirmed', 'subject_en' => 'Confirmed: {{order_number}}', 'body_en' => 'Note: {{note}}', 'is_system' => true]);
        $member = $this->makeMember(['preferred_locale' => 'en']);

        Notify::send($member, 'orders.confirmed', ['order_number' => 'ORD-5', 'note' => '<script>alert("x")</script>'], 'orders');

        Mail::assertSent(NotificationMail::class, function (NotificationMail $mail) {
            $html = $mail->render();
            $this->assertSame('Confirmed: ORD-5', $mail->rendered()['subject']);
            $this->assertStringContainsString('&lt;script&gt;', $html);
            $this->assertStringNotContainsString('<script>alert', $html);

            return true;
        });
    }
}
