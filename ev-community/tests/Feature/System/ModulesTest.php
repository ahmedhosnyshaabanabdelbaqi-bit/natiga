<?php

namespace Tests\Feature\System;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\System\Models\ModuleSetting;
use App\Modules\System\Services\Modules;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ModulesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Modules::flush();
    }

    protected function tearDown(): void
    {
        Modules::flush();
        parent::tearDown();
    }

    public function test_requires_modules_manage(): void
    {
        $this->actingAsRole('operations-manager');
        $this->get('/admin/modules')->assertForbidden();
        $this->put('/admin/modules/catalog', ['enabled' => false, 'reason' => 'Not launching yet'])->assertForbidden();
        $this->assertTrue(Modules::enabled('catalog'));
    }

    public function test_page_lists_modules_with_core_and_experimental_flags(): void
    {
        $this->actingAsStaff(['modules.manage']);

        $this->get('/admin/modules')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admin/modules/index')
                ->has('modules', count(config('ev.modules')))
                ->where('reviewed', false)
                ->where('modules', fn ($modules) => collect($modules)->firstWhere('key', 'route_planner')['experimental'] === true
                    && collect($modules)->firstWhere('key', 'route_planner')['enabled'] === false
                    && collect($modules)->firstWhere('key', 'payments')['core'] === true));
    }

    public function test_disabling_requires_a_reason_and_is_audited(): void
    {
        $actor = $this->actingAsStaff(['modules.manage']);

        $this->put('/admin/modules/catalog', ['enabled' => false])->assertSessionHasErrors('reason');
        $this->put('/admin/modules/catalog', ['enabled' => false, 'reason' => 'abc'])->assertSessionHasErrors('reason');
        Modules::flush();
        $this->assertTrue(Modules::enabled('catalog'));

        $this->put('/admin/modules/catalog', ['enabled' => false, 'reason' => 'Catalog launch postponed'])->assertRedirect()->assertSessionHasNoErrors();
        Modules::flush();
        $this->assertFalse(Modules::enabled('catalog'));

        $log = AuditLog::query()->where('action', 'modules.disabled')->firstOrFail();
        $this->assertSame($actor->id, $log->actor_id);
        $this->assertSame('Catalog launch postponed', $log->reason);
        $this->assertSame(['enabled' => true], $log->old_values);
        $this->assertSame(['enabled' => false], $log->new_values);
    }

    public function test_core_modules_cannot_be_disabled_even_by_the_owner(): void
    {
        $this->actingAsRole('owner');

        $this->put('/admin/modules/payments', ['enabled' => false, 'reason' => 'Trying to disable payments'])->assertSessionHasErrors('enabled');
        Modules::flush();
        $this->assertTrue(Modules::enabled('payments'));
        $this->assertFalse(ModuleSetting::query()->where('key', 'payments')->where('enabled', false)->exists());
        $this->assertFalse(AuditLog::query()->where('action', 'modules.disabled')->exists());
    }

    public function test_unknown_module_is_not_found(): void
    {
        $this->actingAsStaff(['modules.manage']);
        $this->put('/admin/modules/does_not_exist', ['enabled' => true, 'reason' => 'Enable a ghost'])->assertNotFound();
    }

    public function test_review_persists_every_module_state_once(): void
    {
        $this->actingAsStaff(['modules.manage']);

        $this->post('/admin/modules/review')->assertRedirect()->assertSessionHasNoErrors();

        $this->assertSame(count(config('ev.modules')), ModuleSetting::query()->count());
        $this->assertFalse(ModuleSetting::query()->findOrFail('route_planner')->enabled, 'defaults are frozen as they are');
        $this->assertTrue(Modules::reviewed());
        $this->assertTrue(AuditLog::query()->where('action', 'modules.reviewed')->exists());

        $this->get('/admin/modules')->assertInertia(fn (Assert $page) => $page->where('reviewed', true));
    }
}
