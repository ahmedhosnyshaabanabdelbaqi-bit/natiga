<?php

namespace App\Modules\System\Http;

use Illuminate\Http\Request;

/**
 * Page size for server-driven tables: `?per_page=` restricted to the sizes the DataTable offers.
 */
final class PerPage
{
    public const ALLOWED = [15, 25, 50, 100];

    public static function from(Request $request, int $default = 25): int
    {
        $value = filter_var($request->query('per_page'), FILTER_VALIDATE_INT);

        return is_int($value) && in_array($value, self::ALLOWED, true) ? $value : $default;
    }
}
