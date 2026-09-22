<?php

namespace Tests\Feature\Integrations;

use App\Models\User;
use App\Modules\Integrations\Models\ExchangeRate;
use App\Modules\Integrations\Services\ExchangeRates;
use App\Support\Exceptions\DomainException;
use Carbon\CarbonImmutable;
use Database\Seeders\System\CurrencySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use LogicException;
use Tests\TestCase;

class ExchangeRatesTest extends TestCase
{
    use RefreshDatabase;

    private ExchangeRates $rates;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CurrencySeeder::class);
        $this->rates = app(ExchangeRates::class);
    }

    public function test_rate_lookup_returns_the_latest_rate_on_or_before_the_date(): void
    {
        ExchangeRate::factory()->on('2026-01-01')->rate('47.00000000')->create();
        ExchangeRate::factory()->on('2026-01-10')->rate('48.00000000')->create();
        ExchangeRate::factory()->on('2026-01-20')->rate('49.00000000')->create();

        $this->assertSame(['rate' => '48.00', 'source' => 'manual', 'rate_date' => '2026-01-10'], $this->rates->rate('USD', 'EGP', CarbonImmutable::parse('2026-01-15')));
        $this->assertSame('49.00', $this->rates->rate('USD', 'EGP', CarbonImmutable::parse('2026-02-01'))['rate']);
        $this->assertSame('47.00', $this->rates->rate('USD', 'EGP', CarbonImmutable::parse('2026-01-01'))['rate']);
        $this->assertNull($this->rates->rate('USD', 'EGP', CarbonImmutable::parse('2025-12-31')));
        $this->assertSame('1', $this->rates->rate('EGP', 'EGP')['rate']);
    }

    public function test_inverse_pair_is_derived_and_flagged_in_the_source(): void
    {
        ExchangeRate::factory()->on('2026-01-10')->rate('48.00000000')->create();

        $rate = $this->rates->rate('EGP', 'USD', CarbonImmutable::parse('2026-01-15'));

        $this->assertSame('0.02083333', $rate['rate']);
        $this->assertSame('manual:inverse', $rate['source']);
    }

    public function test_convert_to_base_returns_an_exact_fx_snapshot(): void
    {
        ExchangeRate::factory()->on('2026-01-10')->rate('48.00000000')->create();

        $snapshot = $this->rates->convertToBase('250', 'USD', CarbonImmutable::parse('2026-01-12'));

        $this->assertSame([
            'amount' => '12000.00',
            'currency' => 'EGP',
            'rate' => '48.00',
            'source' => 'manual',
            'rate_date' => '2026-01-10',
            'original_amount' => '250.00',
            'original_currency' => 'USD',
        ], $snapshot);
    }

    public function test_convert_same_currency_is_identity_and_missing_rate_throws(): void
    {
        $this->assertSame('1', $this->rates->convertToBase('99.5', 'EGP')['rate']);
        $this->assertSame('99.50', $this->rates->convertToBase('99.5', 'EGP')['amount']);

        $this->expectException(DomainException::class);
        $this->rates->convertToBase('10', 'CNY');
    }

    public function test_manual_rate_requires_the_manage_permission(): void
    {
        $viewer = $this->makeStaff(['exchange_rates.view']);

        $this->expectException(DomainException::class);
        $this->rates->addManualRate('USD', 'EGP', '48.5', '2026-01-10', $viewer, 'CBE published rate');
    }

    public function test_manual_rate_is_appended_audited_and_never_edited(): void
    {
        $accountant = $this->actingAsRole('accountant');

        $this->from(route('admin.integrations.exchange-rates.index'))
            ->post(route('admin.integrations.exchange-rates.store'), ['base_currency' => 'usd', 'quote_currency' => 'EGP', 'rate' => '48.5', 'rate_date' => '2026-01-10', 'reason' => 'CBE published rate'])
            ->assertRedirect(route('admin.integrations.exchange-rates.index'))
            ->assertSessionHas('success');

        $row = ExchangeRate::query()->sole();
        $this->assertSame('USD', $row->base_currency);
        $this->assertSame('48.50000000', $row->rate);
        $this->assertSame('manual', $row->source);
        $this->assertSame($accountant->id, $row->entered_by);
        $this->assertDatabaseHas('audit_logs', ['action' => 'exchange_rates.added', 'actor_id' => $accountant->id, 'entity_id' => $row->id, 'reason' => 'CBE published rate']);

        // Same (pair, date, source) again → conflict, still one row.
        $this->from(route('admin.integrations.exchange-rates.index'))
            ->post(route('admin.integrations.exchange-rates.store'), ['base_currency' => 'USD', 'quote_currency' => 'EGP', 'rate' => '49', 'rate_date' => '2026-01-10', 'reason' => 'Correction attempt'])
            ->assertSessionHasErrors('domain');
        $this->assertSame(1, ExchangeRate::query()->count());

        // Rows are immutable at the model level.
        $this->expectException(LogicException::class);
        $row->update(['rate' => '50']);
    }

    public function test_manual_rate_validation_rules(): void
    {
        $this->actingAsRole('accountant');
        $url = route('admin.integrations.exchange-rates.store');

        $this->post($url, ['base_currency' => 'USD', 'quote_currency' => 'EGP', 'rate' => '48', 'rate_date' => '2026-01-10'])->assertSessionHasErrors('reason');
        $this->post($url, ['base_currency' => 'USD', 'quote_currency' => 'EGP', 'rate' => '-1', 'rate_date' => '2026-01-10', 'reason' => 'negative'])->assertSessionHasErrors('rate');
        $this->post($url, ['base_currency' => 'USD', 'quote_currency' => 'USD', 'rate' => '48', 'rate_date' => '2026-01-10', 'reason' => 'same pair'])->assertSessionHasErrors('quote_currency');
        $this->post($url, ['base_currency' => 'USD', 'quote_currency' => 'EGP', 'rate' => '48', 'rate_date' => now()->addDay()->toDateString(), 'reason' => 'future date'])->assertSessionHasErrors('rate_date');
        $this->post($url, ['base_currency' => 'XXX', 'quote_currency' => 'EGP', 'rate' => '48', 'rate_date' => '2026-01-10', 'reason' => 'unknown currency'])->assertSessionHasErrors('base_currency');
        $this->assertSame(0, ExchangeRate::query()->count());
    }

    public function test_staff_without_permission_get_403_on_the_page_and_the_form(): void
    {
        $this->actingAsStaff([]);
        $this->get(route('admin.integrations.exchange-rates.index'))->assertForbidden();
        $this->post(route('admin.integrations.exchange-rates.store'), ['base_currency' => 'USD', 'quote_currency' => 'EGP', 'rate' => '48', 'rate_date' => '2026-01-10', 'reason' => 'no permission'])->assertForbidden();

        $this->actingAsStaff(['exchange_rates.view']);
        $this->post(route('admin.integrations.exchange-rates.store'), ['base_currency' => 'USD', 'quote_currency' => 'EGP', 'rate' => '48', 'rate_date' => '2026-01-10', 'reason' => 'view only'])->assertForbidden();
    }

    public function test_index_page_shows_latest_rate_cards_and_history(): void
    {
        ExchangeRate::factory()->on('2026-01-10')->rate('48.00000000')->create();
        ExchangeRate::factory()->pair('CNY', 'EGP')->on('2026-01-11')->rate('6.70000000')->fromProvider('acme')->create();

        $this->actingAsStaff(['exchange_rates.view']);
        $this->get(route('admin.integrations.exchange-rates.index', ['source' => 'manual']))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admin/integrations/exchange-rates/index')
                ->where('baseCurrency', 'EGP')
                ->where('canManage', false)
                ->where('provider.driver', 'manual')
                ->where('provider.supports_sync', false)
                ->has('latest', 5)
                ->where('latest.4.currency', 'USD')
                ->where('latest.4.rate', '48.00')
                ->has('rates.data', 1)
                ->where('rates.data.0.rate', '48.00'));
    }

    public function test_sync_is_refused_for_the_manual_driver(): void
    {
        $this->actingAsRole('accountant');
        $this->from(route('admin.integrations.exchange-rates.index'))->post(route('admin.integrations.exchange-rates.sync'))->assertSessionHasErrors('domain');
        $this->assertDatabaseCount('integration_sync_logs', 0);
    }

    public function test_service_rejects_unknown_currency_even_with_permission(): void
    {
        $accountant = User::factory()->create();
        $this->syncRbac();
        $accountant->assignRole('accountant');

        $this->expectException(DomainException::class);
        $this->rates->addManualRate('XXX', 'EGP', '1', '2026-01-10', $accountant, 'unknown currency');
    }
}
