<?php

namespace App\Modules\System\Services;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\System\Models\SystemSetting;
use App\Support\Exceptions\DomainException;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * Admin settings form: builds the grouped payload for the page, validates a group's values against each
 * definition's `rules`, casts by type and saves through Settings::setMany (audited). Sensitive values are
 * masked on the way out and ignored on the way in when the mask comes back unchanged.
 */
final class SettingsForm
{
    public const MASK = '••••••••';

    public const TYPES = ['string', 'text', 'int', 'decimal', 'bool', 'json', 'image', 'select'];

    public function __construct(private readonly AuditService $audit) {}

    /** @return array<int, array{key: string, items: array<int, array<string, mixed>>}> */
    public function groups(): array
    {
        $overridden = SystemSetting::query()->pluck('key')->flip()->all();
        $groups = [];
        foreach (SettingsRegistry::grouped() as $group => $definitions) {
            $items = [];
            foreach ($definitions as $key => $definition) {
                $value = Settings::get($key);
                $items[] = [
                    'key' => $key,
                    'label' => $definition['label'] ?? ['ar' => $key, 'en' => $key],
                    'type' => in_array($definition['type'], self::TYPES, true) ? $definition['type'] : 'string',
                    'input' => $this->inputFor($definition),
                    'options' => isset($definition['options']) ? array_values(array_map('strval', (array) $definition['options'])) : null,
                    'option_labels' => $definition['option_labels'] ?? null,
                    'help' => $definition['help'] ?? null,
                    'rules' => (string) ($definition['rules'] ?? ''),
                    'sensitive' => (bool) $definition['sensitive'],
                    'public' => (bool) $definition['public'],
                    'module' => $definition['module'],
                    'value' => $definition['sensitive'] && $value !== null && $value !== '' ? self::MASK : $value,
                    'default' => $definition['sensitive'] ? null : ($definition['default'] ?? null),
                    'overridden' => isset($overridden[$key]),
                ];
            }
            $groups[] = ['key' => $group, 'items' => $items];
        }
        usort($groups, fn ($a, $b) => $this->groupOrder($a['key']) <=> $this->groupOrder($b['key']) ?: strcmp($a['key'], $b['key']));

        return $groups;
    }

    /**
     * @param  array<string, mixed>  $values
     * @return string[] keys that changed
     */
    public function save(string $group, array $values, ?User $actor, ?string $reason = null): array
    {
        $definitions = SettingsRegistry::grouped()[$group] ?? throw DomainException::because('system.settings.errors.unknown_group', ['group' => $group], 'group');

        $data = [];
        $rules = [];
        $attributes = [];
        $safeToKey = [];
        foreach ($definitions as $key => $definition) {
            // Image settings only change through the MIME-sniffed upload endpoint (or reset): a free-text path
            // could otherwise point the logo at an arbitrary URL.
            if (! array_key_exists($key, $values) || $definition['type'] === 'image') {
                continue;
            }
            $raw = $values[$key];
            if ($definition['sensitive'] && $raw === self::MASK) {
                continue;
            }
            $safe = str_replace('.', '__', $key);
            $safeToKey[$safe] = $key;
            $data[$safe] = $this->normalize($definition['type'], $raw, $key);
            $rules[$safe] = $this->rulesFor($definition);
            $attributes[$safe] = $definition['label'][app()->getLocale()] ?? $key;
        }

        $validator = Validator::make($data, $rules, [], $attributes);
        if ($validator->fails()) {
            $messages = [];
            foreach ($validator->errors()->toArray() as $safe => $list) {
                $messages[$safeToKey[$safe] ?? $safe] = $list;
            }
            throw ValidationException::withMessages($messages);
        }

        $changed = [];
        foreach ($validator->validated() as $safe => $value) {
            $key = $safeToKey[$safe];
            $value = $this->cast($definitions[$key]['type'], $value);
            if ($value !== Settings::get($key)) {
                $changed[$key] = $value;
            }
        }
        if ($changed !== []) {
            Settings::setMany($changed, $actor, $reason);
        }

        return array_keys($changed);
    }

    public function reset(string $key, ?User $actor, ?string $reason = null): void
    {
        $definition = SettingsRegistry::get($key) ?? throw DomainException::because('system.settings.errors.unknown_key', ['key' => $key], 'key');
        $row = SystemSetting::query()->where('key', $key)->first();
        if (! $row) {
            return;
        }
        $old = Settings::get($key);
        if ($definition['type'] === 'image') {
            app(BrandingUploads::class)->forget($old);
        }
        $row->delete();
        Settings::flush();
        $sensitive = (bool) $definition['sensitive'];
        $this->audit->log('settings.reset', $row, old: [$key => $sensitive ? Settings::REDACTED : $old], new: [$key => $sensitive ? Settings::REDACTED : ($definition['default'] ?? null)], reason: $reason, actor: $actor);
    }

    /**
     * UI control for a definition: an explicit `input`, a colour picker for hex-colour rules, otherwise the type.
     *
     * @param  array<string, mixed>  $definition
     */
    private function inputFor(array $definition): string
    {
        if (isset($definition['input']) && is_string($definition['input'])) {
            return $definition['input'];
        }
        $rules = is_array($definition['rules'] ?? null) ? implode('|', array_filter($definition['rules'], 'is_string')) : (string) ($definition['rules'] ?? '');
        if ($definition['type'] === 'string' && str_contains($rules, '#[0-9A-Fa-f]{6}')) {
            return 'color';
        }
        if ($definition['sensitive'] ?? false) {
            return 'secret';
        }

        return in_array($definition['type'], self::TYPES, true) ? $definition['type'] : 'string';
    }

    private function normalize(string $type, mixed $raw, string $key): mixed
    {
        return match ($type) {
            'bool' => filter_var($raw, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? $raw,
            'json' => $this->decodeJson($raw, $key),
            'int', 'decimal' => $raw === '' ? null : $raw,
            default => is_string($raw) && trim($raw) === '' ? null : $raw,
        };
    }

    private function decodeJson(mixed $raw, string $key): mixed
    {
        if (is_array($raw) || $raw === null) {
            return $raw;
        }
        if (is_string($raw)) {
            if (trim($raw) === '') {
                return null;
            }
            $decoded = json_decode($raw, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                return $decoded;
            }
        }
        throw ValidationException::withMessages([$key => __('system.settings.errors.invalid_json')]);
    }

    /** @return array<int, string> */
    private function rulesFor(array $definition): array
    {
        $rules = $definition['rules'] ?? null;
        $list = is_array($rules) ? $rules : array_values(array_filter(explode('|', (string) $rules)));
        $typeRule = match ($definition['type']) {
            'bool' => 'boolean',
            'int' => 'integer',
            'decimal' => 'numeric',
            'json' => 'array',
            'select' => isset($definition['options']) ? 'in:'.implode(',', array_map('strval', (array) $definition['options'])) : null,
            default => null,
        };
        if ($typeRule && ! in_array($typeRule, $list, true)) {
            $list[] = $typeRule;
        }
        if (! in_array('required', $list, true) && ! in_array('nullable', $list, true) && ! in_array('sometimes', $list, true)) {
            array_unshift($list, 'nullable');
        }

        return $list;
    }

    private function cast(string $type, mixed $value): mixed
    {
        if ($value === null) {
            return null;
        }

        return match ($type) {
            'bool' => (bool) $value,
            'int' => (int) $value,
            'decimal' => (string) $value,
            'json' => (array) $value,
            default => is_string($value) ? $value : (string) $value,
        };
    }

    private function groupOrder(string $group): int
    {
        $order = ['general' => 1, 'branding' => 2, 'security' => 3, 'files' => 4, 'members' => 5, 'system' => 99];

        return $order[$group] ?? 50;
    }
}
