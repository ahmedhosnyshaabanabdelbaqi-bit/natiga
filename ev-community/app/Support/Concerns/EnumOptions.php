<?php

namespace App\Support\Concerns;

/**
 * For string-backed enums. Implement `label()` (usually `__('module.enum.'.$this->value)`).
 */
trait EnumOptions
{
    /** @return array<int, array{value: string, label: string}> */
    public static function options(): array
    {
        return array_map(fn (self $case) => ['value' => $case->value, 'label' => $case->label()], self::cases());
    }

    /** @return string[] */
    public static function values(): array
    {
        return array_map(fn (self $case) => $case->value, self::cases());
    }

    public static function tryFromLabel(string $value): ?self
    {
        return self::tryFrom($value);
    }
}
