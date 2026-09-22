<?php

namespace App\Modules\Notifications\Services;

/**
 * Catalogue of notification keys that have an email rendering. Defaults come from
 * `lang/<locale>/notifications.php` (`templates.<category>.<name>.title|body`) or from the translation keys a
 * module registers for its own lang file:
 *
 *   TemplateRegistry::register('orders.confirmed', ['order_number', 'amount'], module: 'orders');
 *   TemplateRegistry::register('group_buying.closed', ['reference'], 'group_buying', 'group_buying.notifications.closed.title', 'group_buying.notifications.closed.body');
 *
 * Admin overrides live in `email_templates` and win over the defaults.
 */
final class TemplateRegistry
{
    /** Variables every template may use (injected by the pipeline). */
    public const COMMON_VARIABLES = ['member_name', 'member_number', 'site', 'url', 'title', 'body'];

    /** @var array<string, array{variables: string[], module: ?string, subject_key: ?string, body_key: ?string}> */
    private static array $registered = [];

    /** @param  string[]  $variables */
    public static function register(string $key, array $variables = [], ?string $module = null, ?string $subjectKey = null, ?string $bodyKey = null): void
    {
        self::$registered[$key] = [
            'variables' => array_values(array_unique(array_map('strval', $variables))),
            'module' => $module,
            'subject_key' => $subjectKey,
            'body_key' => $bodyKey,
        ];
    }

    public static function has(string $key): bool
    {
        return in_array($key, self::keys(), true);
    }

    /** @return string[] */
    public static function keys(): array
    {
        $keys = array_merge(self::langKeys(), array_keys(self::$registered));
        sort($keys);

        return array_values(array_unique($keys));
    }

    /** @return array<int, array{key: string, module: string, variables: string[]}> */
    public static function all(): array
    {
        return array_map(fn (string $key) => [
            'key' => $key,
            'module' => self::moduleFor($key),
            'variables' => self::variablesFor($key),
        ], self::keys());
    }

    public static function moduleFor(string $key): string
    {
        return self::$registered[$key]['module'] ?? explode('.', $key)[0];
    }

    /** Variables a template may reference: common ones + registered + those found in the default texts. */
    public static function variablesFor(string $key): array
    {
        $variables = self::COMMON_VARIABLES;
        $variables = array_merge($variables, self::$registered[$key]['variables'] ?? []);
        foreach (ev_locales() as $locale) {
            $defaults = self::defaults($key, $locale);
            foreach ([$defaults['subject'], $defaults['body']] as $text) {
                if ($text === null) {
                    continue;
                }
                preg_match_all('/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}|:([A-Za-z_][A-Za-z0-9_]*)/u', $text, $matches);
                foreach (array_merge($matches[1], $matches[2]) as $name) {
                    if ($name !== '') {
                        $variables[] = $name;
                    }
                }
            }
        }

        return array_values(array_unique($variables));
    }

    /**
     * Raw default texts (placeholders intact) for a locale.
     *
     * @return array{subject: ?string, body: ?string}
     */
    public static function defaults(string $key, string $locale): array
    {
        $registered = self::$registered[$key] ?? null;
        $subjectKey = $registered['subject_key'] ?? 'notifications.templates.'.$key.'.title';
        $bodyKey = $registered['body_key'] ?? 'notifications.templates.'.$key.'.body';

        return [
            'subject' => self::raw($subjectKey, $locale),
            'body' => self::raw($bodyKey, $locale),
        ];
    }

    public static function reset(): void
    {
        self::$registered = [];
    }

    private static function raw(string $translationKey, string $locale): ?string
    {
        if (! trans()->has($translationKey, $locale, false)) {
            return null;
        }
        $value = trans()->get($translationKey, [], $locale, false);

        return is_string($value) ? $value : null;
    }

    /** @return string[] */
    private static function langKeys(): array
    {
        $keys = [];
        foreach (ev_locales() as $locale) {
            $templates = trans()->get('notifications.templates', [], $locale, false);
            if (! is_array($templates)) {
                continue;
            }
            foreach ($templates as $category => $items) {
                if (! is_array($items)) {
                    continue;
                }
                foreach ($items as $name => $definition) {
                    if (is_array($definition)) {
                        $keys[] = $category.'.'.$name;
                    }
                }
            }
        }

        return array_values(array_unique($keys));
    }
}
