<?php

namespace Tests\Feature\System;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\System\Models\SystemSetting;
use App\Modules\System\Services\Settings;
use App\Modules\System\Services\SettingsForm;
use App\Modules\System\Services\SettingsRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class SettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Settings::flush();
        SettingsRegistry::reset();
    }

    protected function tearDown(): void
    {
        SettingsRegistry::reset();
        Settings::flush();
        parent::tearDown();
    }

    public function test_guests_and_staff_without_permission_are_rejected(): void
    {
        $this->get('/admin/settings')->assertRedirect(config('ev.portals.admin.login'));

        $this->actingAsStaff([]);
        $this->get('/admin/settings')->assertForbidden();
        $this->put('/admin/settings/branding', ['values' => ['branding.site_name_en' => 'X']])->assertForbidden();
    }

    public function test_viewer_sees_grouped_settings_but_cannot_save(): void
    {
        $this->actingAsStaff(['settings.view']);

        $this->get('/admin/settings?group=branding')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admin/settings/index')
                ->where('canManage', false)
                ->where('activeGroup', 'branding')
                ->has('groups')
                ->where('maxImageMb', 2));

        $this->put('/admin/settings/branding', ['values' => ['branding.site_name_en' => 'Hacked']])->assertForbidden();
        $this->assertSame('EV Community Egypt', Settings::get('branding.site_name_en'));
    }

    public function test_manager_saves_a_group_and_each_change_is_audited(): void
    {
        $actor = $this->actingAsStaff(['settings.view', 'settings.manage']);

        $this->put('/admin/settings/branding', [
            'values' => ['branding.site_name_en' => 'EV Egypt', 'branding.accent_color' => '#112233', 'branding.primary_color' => '#0B1220'],
            'reason' => 'Rebranding for launch',
        ])->assertRedirect('/admin/settings?group=branding')->assertSessionHasNoErrors();

        Settings::flush();
        $this->assertSame('EV Egypt', Settings::get('branding.site_name_en'));
        $this->assertSame('#112233', Settings::get('branding.accent_color'));

        $logs = AuditLog::query()->where('action', 'settings.updated')->get();
        $this->assertCount(2, $logs, 'unchanged values (primary colour) are not re-saved');
        $log = $logs->firstWhere('new_values.branding.site_name_en', 'EV Egypt') ?? $logs->first(fn ($l) => array_key_exists('branding.site_name_en', $l->new_values ?? []));
        $this->assertNotNull($log);
        $this->assertSame($actor->id, $log->actor_id);
        $this->assertSame('Rebranding for launch', $log->reason);
        $this->assertSame('EV Community Egypt', $log->old_values['branding.site_name_en']);
    }

    public function test_values_are_validated_against_the_definition_rules(): void
    {
        $this->actingAsStaff(['settings.view', 'settings.manage']);

        $this->put('/admin/settings/branding', ['values' => ['branding.accent_color' => 'red', 'branding.site_name_en' => '']])
            ->assertSessionHasErrors(['branding.accent_color', 'branding.site_name_en']);

        $this->put('/admin/settings/security', ['values' => ['security.session_lifetime_minutes' => '5']])
            ->assertSessionHasErrors(['security.session_lifetime_minutes']);

        $this->put('/admin/settings/general', ['values' => ['general.default_locale' => 'fr']])
            ->assertSessionHasErrors(['general.default_locale']);

        $this->put('/admin/settings/general', ['values' => ['general.social_links' => '{not json']])
            ->assertSessionHasErrors(['general.social_links']);

        $this->assertSame(0, SystemSetting::query()->count());
    }

    public function test_bool_int_and_json_values_are_cast_by_type(): void
    {
        $this->actingAsStaff(['settings.view', 'settings.manage']);

        $this->put('/admin/settings/security', ['values' => ['security.require_email_verification' => true, 'security.session_lifetime_minutes' => '90']])->assertSessionHasNoErrors();
        $this->put('/admin/settings/general', ['values' => ['general.social_links' => '{"facebook":"https://facebook.com/evegypt"}']])->assertSessionHasNoErrors();

        Settings::flush();
        $this->assertTrue(Settings::get('security.require_email_verification'));
        $this->assertSame(90, Settings::get('security.session_lifetime_minutes'));
        $this->assertSame(['facebook' => 'https://facebook.com/evegypt'], Settings::get('general.social_links'));
    }

    public function test_image_settings_cannot_be_set_through_the_form(): void
    {
        $this->actingAsStaff(['settings.view', 'settings.manage']);

        $this->put('/admin/settings/branding', ['values' => ['branding.logo_path' => 'https://evil.example/logo.png']])
            ->assertRedirect()
            ->assertSessionHas('success', __('system.settings.messages.nothing_changed'));

        Settings::flush();
        $this->assertNull(Settings::get('branding.logo_path'));
    }

    public function test_sensitive_values_are_masked_redacted_in_audit_and_not_overwritten_by_the_mask(): void
    {
        SettingsRegistry::register('integrations.test_api_secret', [
            'group' => 'integrations', 'type' => 'string', 'default' => null, 'public' => true, 'sensitive' => true,
            'label' => ['ar' => 'مفتاح سري', 'en' => 'Secret key'], 'rules' => 'nullable|string|max:200',
        ]);
        $this->actingAsStaff(['settings.view', 'settings.manage']);

        $this->put('/admin/settings/integrations', ['values' => ['integrations.test_api_secret' => 'sk_live_super_secret']])->assertSessionHasNoErrors();
        Settings::flush();
        $this->assertSame('sk_live_super_secret', Settings::get('integrations.test_api_secret'));
        $this->assertArrayNotHasKey('integrations.test_api_secret', Settings::public(), 'a secret is never public');

        $response = $this->get('/admin/settings?group=integrations')->assertOk();
        $this->assertStringNotContainsString('sk_live_super_secret', $response->getContent());
        $response->assertInertia(fn (Assert $page) => $page->where('groups', function ($groups) {
            $item = collect($groups)->flatMap(fn ($group) => $group['items'])->firstWhere('key', 'integrations.test_api_secret');

            return $item['value'] === SettingsForm::MASK && $item['sensitive'] === true && $item['input'] === 'secret';
        }));

        $log = AuditLog::query()->where('action', 'settings.updated')->latest('id')->firstOrFail();
        $this->assertSame(Settings::REDACTED, $log->new_values['integrations.test_api_secret']);
        $this->assertStringNotContainsString('sk_live_super_secret', json_encode([$log->old_values, $log->new_values]));

        // Submitting the mask back keeps the stored secret.
        $this->put('/admin/settings/integrations', ['values' => ['integrations.test_api_secret' => SettingsForm::MASK]])->assertSessionHasNoErrors();
        Settings::flush();
        $this->assertSame('sk_live_super_secret', Settings::get('integrations.test_api_secret'));
    }

    public function test_reset_to_default_removes_the_override_and_is_audited(): void
    {
        $actor = $this->actingAsStaff(['settings.view', 'settings.manage']);
        Settings::set('branding.site_name_en', 'Temporary', $actor);

        $this->delete('/admin/settings/branding.site_name_en', ['reason' => 'Back to default'])->assertRedirect()->assertSessionHasNoErrors();

        Settings::flush();
        $this->assertSame('EV Community Egypt', Settings::get('branding.site_name_en'));
        $this->assertFalse(SystemSetting::query()->where('key', 'branding.site_name_en')->exists());
        $log = AuditLog::query()->where('action', 'settings.reset')->firstOrFail();
        $this->assertSame('Temporary', $log->old_values['branding.site_name_en']);
        $this->assertSame('Back to default', $log->reason);
    }

    public function test_branding_upload_sniffs_the_real_mime_type_and_enforces_the_size_limit(): void
    {
        Storage::fake('public');
        $this->actingAsStaff(['settings.view', 'settings.manage']);

        $this->post('/admin/settings/branding/branding.logo_path', ['file' => UploadedFile::fake()->image('logo.png', 200, 60)])
            ->assertRedirect('/admin/settings?group=branding')->assertSessionHasNoErrors();
        Settings::flush();
        $path = Settings::get('branding.logo_path');
        $this->assertIsString($path);
        $this->assertStringStartsWith('/storage/branding/logo-', $path);
        Storage::disk('public')->assertExists(substr($path, strlen('/storage/')));

        // A text file pretending to be a PNG is rejected by finfo.
        $fake = UploadedFile::fake()->createWithContent('logo.png', '<?php echo "not an image";');
        $this->post('/admin/settings/branding/branding.logo_path', ['file' => $fake])->assertSessionHasErrors('file');

        // > 2 MB is rejected.
        $this->post('/admin/settings/branding/branding.logo_path', ['file' => UploadedFile::fake()->image('big.png')->size(2100)])->assertSessionHasErrors('file');

        // Only image settings accept uploads.
        $this->post('/admin/settings/branding/branding.site_name_en', ['file' => UploadedFile::fake()->image('x.png')])->assertSessionHasErrors('file');

        // Removing the image deletes the file.
        $this->delete('/admin/settings/branding.logo_path')->assertRedirect();
        Storage::disk('public')->assertMissing(substr($path, strlen('/storage/')));
    }
}
