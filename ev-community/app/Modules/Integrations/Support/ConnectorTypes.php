<?php

namespace App\Modules\Integrations\Support;

/**
 * Maps vendor / OCPI / OCPP connector codes onto the platform's connector_types.code vocabulary
 * (type2, ccs2, chademo, gbt_ac, gbt_dc). Unknown codes become "unknown" and are kept for review.
 */
final class ConnectorTypes
{
    public const INTERNAL = ['type2', 'ccs2', 'chademo', 'gbt_ac', 'gbt_dc'];

    public const UNKNOWN = 'unknown';

    /** @var array<string, string> */
    private const ALIASES = [
        'type2' => 'type2', 'type_2' => 'type2', 'type-2' => 'type2', 'mennekes' => 'type2', 'iec_62196_t2' => 'type2', 'iec62196type2' => 'type2', 'iec-62196-t2' => 'type2', 't2' => 'type2', 'ac_type2' => 'type2', 'type2_socket' => 'type2', 'type2_cable' => 'type2',
        'ccs2' => 'ccs2', 'ccs' => 'ccs2', 'ccs_2' => 'ccs2', 'ccs-2' => 'ccs2', 'combo2' => 'ccs2', 'combo_2' => 'ccs2', 'iec_62196_t2_combo' => 'ccs2', 'iec62196type2combo' => 'ccs2', 'iec-62196-t2-combo' => 'ccs2', 'ccs_combo_2' => 'ccs2',
        'chademo' => 'chademo', 'cha_de_mo' => 'chademo', 'chademo_dc' => 'chademo',
        'gbt_ac' => 'gbt_ac', 'gb_t_ac' => 'gbt_ac', 'gbt-ac' => 'gbt_ac', 'gb/t_ac' => 'gbt_ac', 'gbt' => 'gbt_ac', 'gb_t' => 'gbt_ac', 'gb/t' => 'gbt_ac', 'gbt_20234_2' => 'gbt_ac', 'gb-t-ac' => 'gbt_ac',
        'gbt_dc' => 'gbt_dc', 'gb_t_dc' => 'gbt_dc', 'gbt-dc' => 'gbt_dc', 'gb/t_dc' => 'gbt_dc', 'gbt_20234_3' => 'gbt_dc', 'gb-t-dc' => 'gbt_dc',
    ];

    public static function normalize(?string $vendorCode, ?string $currentType = null): string
    {
        $code = strtolower(trim((string) $vendorCode));
        $code = str_replace([' ', '.'], ['_', '_'], $code);
        if ($code === '') {
            return self::UNKNOWN;
        }
        if (isset(self::ALIASES[$code])) {
            $mapped = self::ALIASES[$code];
            // GB/T without an explicit AC/DC marker: use the current type when the vendor gives it.
            if (in_array($code, ['gbt', 'gb_t', 'gb/t'], true) && strtolower((string) $currentType) === 'dc') {
                return 'gbt_dc';
            }

            return $mapped;
        }

        return self::UNKNOWN;
    }

    public static function currentTypeFor(string $internalCode): ?string
    {
        return match ($internalCode) {
            'type2', 'gbt_ac' => 'ac',
            'ccs2', 'chademo', 'gbt_dc' => 'dc',
            default => null,
        };
    }
}
