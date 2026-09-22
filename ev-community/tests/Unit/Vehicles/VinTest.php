<?php

namespace Tests\Unit\Vehicles;

use App\Modules\Vehicles\Models\MemberVehicle;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class VinTest extends TestCase
{
    public function test_normalization_uppercases_and_strips_separators(): void
    {
        $this->assertSame('LGXCE4CB5N0123456', MemberVehicle::normalizeVin(' lgxce4cb5n-0123 456 '));
        $this->assertNull(MemberVehicle::normalizeVin('  - '));
        $this->assertNull(MemberVehicle::normalizeVin(null));
    }

    /** @return array<string, array{string, bool}> */
    public static function vins(): array
    {
        return [
            'valid' => ['LGXCE4CB5N0123456', true],
            'too short' => ['LGXCE4CB5N012345', false],
            'too long' => ['LGXCE4CB5N01234567', false],
            'letter I' => ['LGXCE4CB5N012345I', false],
            'letter O' => ['LGXCE4CB5N012345O', false],
            'letter Q' => ['LGXCE4CB5N012345Q', false],
            'lowercase is not normalized here' => ['lgxce4cb5n0123456', false],
            'symbols' => ['LGXCE4CB5N01234-6', false],
        ];
    }

    #[DataProvider('vins')]
    public function test_vin_format_rules(string $vin, bool $valid): void
    {
        $this->assertSame($valid, MemberVehicle::isValidVin($vin));
    }

    public function test_hash_is_sha256_of_the_normalized_vin(): void
    {
        $this->assertSame(hash('sha256', 'LGXCE4CB5N0123456'), MemberVehicle::hashVin('LGXCE4CB5N0123456'));
        $this->assertSame(MemberVehicle::hashVin('LGXCE4CB5N0123456'), MemberVehicle::hashVin('lgxce4cb5n 0123456'));
        $this->assertNotSame(MemberVehicle::hashVin('LGXCE4CB5N0123456'), MemberVehicle::hashVin('LGXCE4CB5N0123457'));
    }

    public function test_masked_vin_shows_only_the_last_four_characters(): void
    {
        $vehicle = new MemberVehicle;
        $vehicle->vin = 'LGXCE4CB5N0123456';

        $this->assertSame('*************3456', $vehicle->maskedVin());
        $this->assertStringNotContainsString('LGXCE', (string) $vehicle->maskedVin());
    }

    public function test_vin_and_hash_are_never_serialized(): void
    {
        $vehicle = new MemberVehicle(['nickname' => 'Blue']);
        $vehicle->vin = 'LGXCE4CB5N0123456';
        $vehicle->vin_hash = MemberVehicle::hashVin('LGXCE4CB5N0123456');

        $array = $vehicle->toArray();
        $this->assertArrayNotHasKey('vin', $array);
        $this->assertArrayNotHasKey('vin_hash', $array);
        $this->assertStringNotContainsString('LGXCE4CB5N0123456', $vehicle->toJson());
    }
}
