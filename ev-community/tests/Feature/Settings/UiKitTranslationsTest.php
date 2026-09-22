<?php

namespace Tests\Feature\Settings;

use App\Modules\Auth\Services\TranslationExporter;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

/**
 * i18n guard for the UI kit, the starter auth/settings pages and their language files:
 * AR/EN key sets and :placeholders match, every literal t('…') key used in these sources exists
 * in both locales, and no hard-coded English copy slips back into the markup.
 */
class UiKitTranslationsTest extends TestCase
{
    /** Language files owned (or extended) by the UI kit. */
    private const LANG_FILES = ['settings', 'ui', 'auth'];

    /** Source files whose visible strings must go through t(). */
    private const SOURCES = [
        'resources/js/components/ui',
        'resources/js/components/shared',
        'resources/js/hooks',
        'resources/js/layouts/settings',
        'resources/js/pages/settings/profile.tsx',
        'resources/js/pages/settings/security.tsx',
        'resources/js/pages/settings/appearance.tsx',
        'resources/js/pages/auth/forgot-password.tsx',
        'resources/js/pages/auth/reset-password.tsx',
        'resources/js/pages/auth/verify-email.tsx',
        'resources/js/pages/auth/two-factor-challenge.tsx',
        'resources/js/pages/auth/confirm-password.tsx',
        'resources/js/components/manage-two-factor.tsx',
        'resources/js/components/two-factor-setup-modal.tsx',
        'resources/js/components/two-factor-recovery-codes.tsx',
        'resources/js/components/manage-passkeys.tsx',
        'resources/js/components/passkey-item.tsx',
        'resources/js/components/passkey-register.tsx',
        'resources/js/components/passkey-verify.tsx',
        'resources/js/components/delete-user.tsx',
        'resources/js/components/appearance-tabs.tsx',
        'resources/js/components/breadcrumbs.tsx',
        'resources/js/components/user-info.tsx',
        'resources/js/components/heading.tsx',
        'resources/js/components/input-error.tsx',
        'resources/js/components/text-link.tsx',
        'resources/js/components/password-input.tsx',
        'resources/js/components/alert-error.tsx',
    ];

    /** Keys built from template literals (t(`ui.qr.${status}`) etc.) that the scan cannot see. */
    private const DYNAMIC_KEYS = [
        'ui.qr.permission_denied', 'ui.qr.unsupported', 'ui.qr.insecure', 'ui.qr.error',
        'ui.steps.done', 'ui.steps.current', 'ui.steps.pending',
    ];

    public function test_arabic_and_english_files_have_identical_keys_and_placeholders(): void
    {
        foreach (self::LANG_FILES as $file) {
            $ar = $this->flatten(require lang_path("ar/{$file}.php"));
            $en = $this->flatten(require lang_path("en/{$file}.php"));

            $this->assertSame([], array_keys(array_diff_key($ar, $en)), "Keys only in lang/ar/{$file}.php");
            $this->assertSame([], array_keys(array_diff_key($en, $ar)), "Keys only in lang/en/{$file}.php");

            foreach ($en as $key => $value) {
                $this->assertSame($this->placeholders($value), $this->placeholders($ar[$key]), "Placeholder mismatch for {$file}.{$key}");
                $this->assertNotSame('', trim($ar[$key]), "Empty Arabic translation for {$file}.{$key}");
            }
        }
    }

    public function test_every_translation_key_used_by_the_ui_kit_exists_in_both_locales(): void
    {
        $dictionaries = [
            'ar' => $this->dictionary('ar'),
            'en' => $this->dictionary('en'),
        ];

        $keys = self::DYNAMIC_KEYS;
        foreach ($this->sourceFiles() as $path) {
            preg_match_all('/\bt\(\s*[\'"]([a-z0-9_]+(?:\.[a-z0-9_]+)+)[\'"]/', File::get($path), $matches);
            foreach ($matches[1] as $key) {
                $keys[] = $key;
            }
        }
        $keys = array_values(array_unique($keys));
        $this->assertNotEmpty($keys);

        foreach ($dictionaries as $locale => $dictionary) {
            $missing = array_values(array_filter($keys, fn (string $key) => ! array_key_exists($key, $dictionary)));
            $this->assertSame([], $missing, "Missing {$locale} translations");
        }
    }

    public function test_no_hard_coded_english_copy_in_ui_kit_markup(): void
    {
        $allowed = ['email@example.com'];
        $offenders = [];

        foreach ($this->sourceFiles() as $path) {
            // Comments may legitimately contain English; arrow functions (`=> Promise<T>`) are not JSX.
            $source = preg_replace(['~/\*.*?\*/~s', '~(^|\s)//[^\n]*~'], ['', '$1'], File::get($path));
            // JSX text nodes such as <span>Close</span>
            if (preg_match_all('/(?<![=-])>\s*([A-Za-z][A-Za-z ,.\'!?-]{2,})\s*</', $source, $text)) {
                foreach ($text[1] as $match) {
                    $offenders[] = "{$path}: text \"{$match}\"";
                }
            }
            // User-facing attributes such as aria-label="Close"
            if (preg_match_all('/\b(aria-label|placeholder|title|alt)="([^"{]*[A-Za-z][^"]*)"/', $source, $attributes, PREG_SET_ORDER)) {
                foreach ($attributes as [, $attribute, $value]) {
                    if (! in_array($value, $allowed, true)) {
                        $offenders[] = "{$path}: {$attribute}=\"{$value}\"";
                    }
                }
            }
        }

        $this->assertSame([], $offenders);
    }

    public function test_frontend_receives_the_ui_kit_translations(): void
    {
        $this->assertSame(trans('settings.nav.sessions', [], 'ar'), $this->dictionary('ar')['settings.nav.sessions']);
        $this->assertSame('Sessions', $this->dictionary('en')['settings.nav.sessions']);
    }

    /** @return array<string, string> */
    private function dictionary(string $locale): array
    {
        return app(TranslationExporter::class)->forLocale($locale);
    }

    /** @return list<string> */
    private function sourceFiles(): array
    {
        $files = [];
        foreach (self::SOURCES as $source) {
            $path = base_path($source);
            if (is_dir($path)) {
                foreach (File::allFiles($path) as $file) {
                    if (in_array($file->getExtension(), ['ts', 'tsx'], true)) {
                        $files[] = $file->getPathname();
                    }
                }
            } else {
                $this->assertFileExists($path);
                $files[] = $path;
            }
        }

        return $files;
    }

    /** @return array<string, string> */
    private function flatten(array $items, string $prefix = ''): array
    {
        $out = [];
        foreach ($items as $key => $value) {
            $full = $prefix === '' ? (string) $key : "{$prefix}.{$key}";
            if (is_array($value)) {
                $out += $this->flatten($value, $full);
            } else {
                $out[$full] = (string) $value;
            }
        }

        return $out;
    }

    /** @return list<string> */
    private function placeholders(string $value): array
    {
        preg_match_all('/:([a-z_]+)/', $value, $matches);
        $names = array_values(array_unique($matches[1]));
        sort($names);

        return $names;
    }
}
