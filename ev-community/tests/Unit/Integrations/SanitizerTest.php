<?php

namespace Tests\Unit\Integrations;

use App\Modules\Integrations\Support\Sanitizer;
use PHPUnit\Framework\TestCase;

class SanitizerTest extends TestCase
{
    public function test_secret_like_keys_are_redacted_recursively(): void
    {
        $out = Sanitizer::redact(['api_key' => 'abc', 'nested' => ['Authorization' => 'Bearer x', 'name' => 'ok'], 'card_number' => '4111', 'amount' => '10.00']);

        $this->assertSame('[redacted]', $out['api_key']);
        $this->assertSame('[redacted]', $out['nested']['Authorization']);
        $this->assertSame('[redacted]', $out['card_number']);
        $this->assertSame('ok', $out['nested']['name']);
        $this->assertSame('10.00', $out['amount']);
    }

    public function test_headers_are_lowercased_flattened_and_redacted(): void
    {
        $out = Sanitizer::headers(['Content-Type' => ['application/json'], 'X-Signature' => ['deadbeef'], 'Cookie' => ['a=b']]);

        $this->assertSame('application/json', $out['content-type']);
        $this->assertSame('[redacted]', $out['x-signature']);
        $this->assertSame('[redacted]', $out['cookie']);
    }

    public function test_error_messages_drop_query_strings_and_are_truncated(): void
    {
        $this->assertSame('GET https://api.test/v1/rates?…', Sanitizer::error('GET https://api.test/v1/rates?key=SECRET&x=1'));
        $this->assertSame(500, mb_strlen((string) Sanitizer::error(str_repeat('a', 900))));
        $this->assertNull(Sanitizer::error(null));
    }
}
