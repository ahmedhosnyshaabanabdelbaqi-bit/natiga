<?php

namespace Database\Factories\Integrations;

use App\Modules\Integrations\Models\ExchangeRate;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ExchangeRate>
 *
 * Requires the currencies table to be seeded (CurrencySeeder) because of the FK.
 */
class ExchangeRateFactory extends Factory
{
    protected $model = ExchangeRate::class;

    public function definition(): array
    {
        return [
            'base_currency' => 'USD',
            'quote_currency' => 'EGP',
            'rate' => '48.00000000',
            'source' => 'manual',
            'source_reference' => null,
            'rate_date' => now()->toDateString(),
            'reason' => 'Factory rate',
            'entered_by' => null,
        ];
    }

    public function pair(string $base, string $quote): static
    {
        return $this->state(fn () => ['base_currency' => $base, 'quote_currency' => $quote]);
    }

    public function on(string $date): static
    {
        return $this->state(fn () => ['rate_date' => $date]);
    }

    public function rate(string $rate): static
    {
        return $this->state(fn () => ['rate' => $rate]);
    }

    public function fromProvider(string $name = 'test'): static
    {
        return $this->state(fn () => ['source' => 'provider:'.$name, 'reason' => null]);
    }
}
