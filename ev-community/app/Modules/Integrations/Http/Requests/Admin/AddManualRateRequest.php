<?php

namespace App\Modules\Integrations\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AddManualRateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('exchange_rates.manage') ?? false;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // Convention: base = foreign currency; the platform currency is always the quote.
            'base_currency' => ['required', 'string', 'size:3', 'exists:currencies,code', Rule::notIn([strtoupper((string) config('ev.base_currency', 'EGP'))])],
            'quote_currency' => ['required', 'string', 'size:3', 'exists:currencies,code', 'different:base_currency'],
            'rate' => ['required', 'numeric', 'gt:0', 'regex:/^\d{1,10}(\.\d{1,8})?$/'],
            'rate_date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'reason' => ['required', 'string', 'min:5', 'max:500'],
            // true = this entry corrects the rate already recorded for that pair and date.
            'correction' => ['sometimes', 'boolean'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'base_currency' => strtoupper(trim((string) $this->input('base_currency'))),
            'quote_currency' => strtoupper(trim((string) $this->input('quote_currency'))),
            'rate' => trim((string) $this->input('rate')),
        ]);
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'base_currency.not_in' => __('integrations.errors.base_must_be_foreign', ['currency' => strtoupper((string) config('ev.base_currency', 'EGP'))]),
        ];
    }

    public function attributes(): array
    {
        return [
            'base_currency' => __('integrations.exchange_rates.form.base_currency'),
            'quote_currency' => __('integrations.exchange_rates.form.quote_currency'),
            'rate' => __('integrations.exchange_rates.form.rate'),
            'rate_date' => __('integrations.exchange_rates.form.rate_date'),
            'reason' => __('core.labels.reason'),
            'correction' => __('integrations.exchange_rates.form.correction'),
        ];
    }
}
