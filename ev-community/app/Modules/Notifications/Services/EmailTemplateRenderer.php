<?php

namespace App\Modules\Notifications\Services;

use App\Modules\Notifications\Models\EmailTemplate;
use App\Modules\Notifications\Support\NotificationUrl;
use App\Modules\System\Services\Settings;

/**
 * Renders email subject/body from an admin-editable template (or the lang defaults).
 *
 * Security model: the template text is tokenised first, then HTML-escaped, then a tiny markdown subset is applied
 * (**bold**, [text](https://url), line breaks); variable values are substituted LAST and always escaped, so any
 * HTML/markdown inside a value is rendered as literal text. Unknown variables render as an empty string.
 * Placeholders: `{{name}}` (admin templates) and `:name` (lang defaults, only for known variables).
 */
final class EmailTemplateRenderer
{
    private const TOKEN_START = "\u{E000}";

    private const TOKEN_END = "\u{E001}";

    /**
     * @param  array<string, mixed>  $variables
     * @return array{subject: string, html: string, text: string, customized: bool}
     */
    public function render(string $key, string $locale, array $variables = [], ?EmailTemplate $override = null, bool $useStored = true): array
    {
        $override ??= $useStored ? EmailTemplate::query()->where('key', $key)->first() : null;
        $defaults = TemplateRegistry::defaults($key, $locale);
        $allowed = TemplateRegistry::variablesFor($key);

        $subjectTemplate = $override?->subject($locale) ?? $defaults['subject'] ?? '{{title}}';
        $bodyTemplate = $override?->body($locale) ?? $defaults['body'] ?? '{{body}}';

        return [
            'subject' => $this->renderSubject($subjectTemplate, $variables, $allowed),
            'html' => $this->renderHtml($bodyTemplate, $variables, $allowed),
            'text' => $this->renderText($bodyTemplate, $variables, $allowed),
            'customized' => $override !== null && ($override->subject($locale) !== null || $override->body($locale) !== null),
        ];
    }

    /** @param  array<string, mixed>  $variables */
    public function renderSubject(string $template, array $variables, array $allowed = []): string
    {
        $text = $this->renderText($template, $variables, $allowed);
        $text = preg_replace('/\s+/u', ' ', $text) ?? $text;

        return mb_substr(trim($text), 0, 255);
    }

    /** @param  array<string, mixed>  $variables */
    public function renderHtml(string $template, array $variables, array $allowed = []): string
    {
        [$tokenised, $values] = $this->tokenise($template, $variables, $allowed);
        $html = e($tokenised);
        $html = preg_replace('/\*\*(.+?)\*\*/su', '<strong>$1</strong>', $html) ?? $html;
        $html = preg_replace_callback('/\[([^\]\n]+)\]\(([^)\s]+)\)/u', function (array $m) use ($values): string {
            // $m[2] is already HTML-escaped: decode it, substitute raw values, then validate the real URL.
            $href = NotificationUrl::sanitize(html_entity_decode($this->detokenise($m[2], $values), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            if ($href === null) {
                return $m[1].' ('.$m[2].')';
            }

            return '<a href="'.e(NotificationUrl::absolute($href)).'">'.$m[1].'</a>';
        }, $html) ?? $html;

        $paragraphs = preg_split('/\n{2,}/u', str_replace("\r\n", "\n", $html)) ?: [];
        $html = implode('', array_map(fn (string $p) => '<p>'.nl2br(trim($p), false).'</p>', array_filter($paragraphs, fn ($p) => trim($p) !== '')));

        return $this->detokenise($html, array_map(fn (string $v) => e($v), $values));
    }

    /** @param  array<string, mixed>  $variables */
    public function renderText(string $template, array $variables, array $allowed = []): string
    {
        [$tokenised, $values] = $this->tokenise($template, $variables, $allowed);
        $text = preg_replace('/\*\*(.+?)\*\*/su', '$1', $tokenised) ?? $tokenised;
        $text = preg_replace_callback('/\[([^\]\n]+)\]\(([^)\s]+)\)/u', fn (array $m) => $m[1].' ('.$m[2].')', $text) ?? $text;

        return trim($this->detokenise(str_replace("\r\n", "\n", $text), $values));
    }

    /** True when the text contains anything that looks like an HTML tag or entity-based markup. */
    public static function containsHtml(string $text): bool
    {
        return (bool) preg_match('/<\s*\/?\s*[a-zA-Z!\/?]/u', $text)
            || (bool) preg_match('/&(#\d+|#x[0-9a-f]+|[a-z]+);/iu', $text)
            || (bool) preg_match('/(javascript|vbscript)\s*:/iu', $text);
    }

    /**
     * Sample data for previews (never real member data).
     *
     * @return array<string, string>
     */
    public function sampleVariables(string $key, string $locale): array
    {
        $samples = trans()->get('notifications.sample', [], $locale, false);
        $samples = is_array($samples) ? $samples : [];
        $out = [];
        foreach (TemplateRegistry::variablesFor($key) as $name) {
            $out[$name] = (string) ($samples[$name] ?? $this->fallbackSample($name, $locale));
        }
        $out['site'] = (string) Settings::localized('branding.site_name', $locale, config('app.name'));
        $out['url'] = rtrim((string) config('app.url'), '/').'/account/notifications';

        return $out;
    }

    private function fallbackSample(string $name, string $locale): string
    {
        return match ($name) {
            'site' => (string) Settings::localized('branding.site_name', $locale, config('app.name')),
            'url' => rtrim((string) config('app.url'), '/').'/account',
            default => '['.str_replace('_', ' ', $name).']',
        };
    }

    /**
     * @param  array<string, mixed>  $variables
     * @return array{0: string, 1: array<int, string>}
     */
    private function tokenise(string $template, array $variables, array $allowed): array
    {
        $values = [];
        $pattern = '/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}|:([A-Za-z_][A-Za-z0-9_]*)/u';
        $text = preg_replace_callback($pattern, function (array $m) use (&$values, $variables, $allowed): string {
            $braced = ($m[1] ?? '') !== '';
            $name = $braced ? $m[1] : ($m[2] ?? '');
            if (! $braced && ! in_array($name, $allowed, true) && ! array_key_exists($name, $variables)) {
                return $m[0]; // a literal colon-word, not a placeholder
            }
            $values[] = $this->stringify($variables[$name] ?? null);

            return self::TOKEN_START.(count($values) - 1).self::TOKEN_END;
        }, $template);

        return [$text ?? $template, $values];
    }

    /** @param  array<int, string>  $values */
    private function detokenise(string $text, array $values): string
    {
        return preg_replace_callback('/'.self::TOKEN_START.'(\d+)'.self::TOKEN_END.'/u', fn (array $m) => $values[(int) $m[1]] ?? '', $text) ?? $text;
    }

    private function stringify(mixed $value): string
    {
        $string = match (true) {
            $value === null => '',
            is_bool($value) => $value ? __('core.labels.yes') : __('core.labels.no'),
            is_scalar($value) => (string) $value,
            is_array($value) => implode(', ', array_map(fn ($v) => is_scalar($v) ? (string) $v : '', $value)),
            $value instanceof \Stringable => (string) $value,
            default => '',
        };

        return preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $string) ?? $string;
    }
}
