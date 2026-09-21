<?php

use App\Support\Dec;

if (! function_exists('bcCompatAdd')) {
    /** جمع رصيد جارٍ بدقة عشرية: الرصيد + مدين − دائن. */
    function bcCompatAdd(mixed $balance, mixed $debit, mixed $credit): string
    {
        return Dec::money(Dec::add($balance, Dec::sub($debit, $credit)));
    }
}

if (! function_exists('bcCompatMul')) {
    /** ضرب عشري دقيق للاستخدام في البذور والتقارير. */
    function bcCompatMul(mixed $a, mixed $b): string
    {
        return Dec::money(Dec::mul($a, $b));
    }
}
