<?php

namespace App\Modules\Notifications\Services;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Notifications\Models\EmailTemplate;
use App\Support\Exceptions\DomainException;
use Illuminate\Support\Facades\DB;

/**
 * Admin management of email templates. Every key comes from TemplateRegistry (lang defaults + keys registered by
 * modules); a row in `email_templates` only exists while a template is customized. Bodies are plain text with line
 * breaks, **bold** and [links](https://…); HTML/script is rejected and `{{variables}}` must be declared for the key.
 */
final class EmailTemplateService
{
    public const FIELDS = ['subject_ar', 'subject_en', 'body_ar', 'body_en'];

    public function __construct(private readonly AuditService $audit, private readonly EmailTemplateRenderer $renderer) {}

    /**
     * @return array<int, array{key: string, module: string, module_label: string, subject: string, customized: bool, updated_at: ?string, updated_by: ?string}>
     */
    public function list(?string $search = null, ?string $module = null, ?bool $customized = null): array
    {
        $locale = app()->getLocale();
        $overrides = EmailTemplate::query()->with('editor:id,name')->get()->keyBy('key');
        $search = $search !== null ? mb_strtolower(trim($search)) : '';
        $rows = [];
        foreach (TemplateRegistry::all() as $entry) {
            $key = $entry['key'];
            /** @var EmailTemplate|null $override */
            $override = $overrides->get($key);
            $isCustomized = $this->isCustomized($override);
            $subject = $override?->subject($locale) ?? TemplateRegistry::defaults($key, $locale)['subject'] ?? '';
            if ($module !== null && $module !== '' && $entry['module'] !== $module) {
                continue;
            }
            if ($customized !== null && $isCustomized !== $customized) {
                continue;
            }
            if ($search !== '' && ! str_contains(mb_strtolower($key.' '.$subject), $search)) {
                continue;
            }
            $rows[] = [
                'key' => $key,
                'module' => $entry['module'],
                'module_label' => $this->moduleLabel($entry['module']),
                'subject' => $subject,
                'customized' => $isCustomized,
                'updated_at' => $isCustomized ? $override?->updated_at?->toIso8601String() : null,
                'updated_by' => $isCustomized ? $override?->editor?->name : null,
            ];
        }

        return $rows;
    }

    /** @return array<int, array{value: string, label: string}> */
    public function moduleOptions(): array
    {
        $modules = array_values(array_unique(array_map(fn (array $e) => $e['module'], TemplateRegistry::all())));
        sort($modules);

        return array_map(fn (string $m) => ['value' => $m, 'label' => $this->moduleLabel($m)], $modules);
    }

    /** @return array<string, mixed> */
    public function detail(string $key): array
    {
        $this->assertKnown($key);
        $override = EmailTemplate::query()->with('editor:id,name')->where('key', $key)->first();
        $defaults = [];
        foreach (ev_locales() as $locale) {
            $defaults[$locale] = TemplateRegistry::defaults($key, $locale);
        }

        return [
            'key' => $key,
            'module' => TemplateRegistry::moduleFor($key),
            'module_label' => $this->moduleLabel(TemplateRegistry::moduleFor($key)),
            'variables' => TemplateRegistry::variablesFor($key),
            'defaults' => $defaults,
            'values' => [
                'subject_ar' => $override?->subject_ar,
                'subject_en' => $override?->subject_en,
                'body_ar' => $override?->body_ar,
                'body_en' => $override?->body_en,
            ],
            'customized' => $this->isCustomized($override),
            'updated_at' => $override?->updated_at?->toIso8601String(),
            'updated_by' => $override?->editor?->name,
        ];
    }

    /** @param  array<string, mixed>  $input */
    public function update(string $key, array $input, User $actor): ?EmailTemplate
    {
        $this->assertKnown($key);
        $values = $this->validated($key, $input);

        return DB::transaction(function () use ($key, $values, $actor) {
            $template = EmailTemplate::query()->where('key', $key)->lockForUpdate()->first();
            $before = $template ? $template->only(self::FIELDS) : array_fill_keys(self::FIELDS, null);

            if (array_filter($values, fn ($v) => $v !== null) === []) {
                // Everything emptied: identical to a reset (defaults apply again).
                if ($template !== null) {
                    $template->delete();
                    $this->audit->log('notifications.template_reset', null, old: $before, actor: $actor, entityLabel: $key);
                }

                return null;
            }

            $template ??= new EmailTemplate(['key' => $key, 'is_system' => true]);
            $template->fill($values + ['variables' => TemplateRegistry::variablesFor($key), 'updated_by' => $actor->id])->save();
            $this->audit->logChanges('notifications.template_updated', $template, $before, $template->only(self::FIELDS), actor: $actor);

            return $template;
        });
    }

    public function reset(string $key, User $actor): void
    {
        $this->assertKnown($key);
        DB::transaction(function () use ($key, $actor) {
            $template = EmailTemplate::query()->where('key', $key)->lockForUpdate()->first();
            if ($template === null) {
                return;
            }
            $before = $template->only(self::FIELDS);
            $template->delete();
            $this->audit->log('notifications.template_reset', null, old: $before, actor: $actor, entityLabel: $key);
        });
    }

    /**
     * Live preview with sample data (never real member data). Uses the unsaved input; empty fields fall back to defaults.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, array{subject: string, html: string, text: string}>
     */
    public function preview(string $key, array $input): array
    {
        $this->assertKnown($key);
        $draft = new EmailTemplate(['key' => $key] + array_map(fn ($v) => is_string($v) && trim($v) !== '' ? $v : null, array_intersect_key($input, array_flip(self::FIELDS))));
        $out = [];
        foreach (ev_locales() as $locale) {
            $rendered = $this->renderer->render($key, $locale, $this->renderer->sampleVariables($key, $locale), $draft, false);
            $out[$locale] = ['subject' => $rendered['subject'], 'html' => $rendered['html'], 'text' => $rendered['text']];
        }

        return $out;
    }

    public function assertKnown(string $key): void
    {
        if (! TemplateRegistry::has($key)) {
            abort(404);
        }
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, ?string>
     */
    private function validated(string $key, array $input): array
    {
        $allowed = TemplateRegistry::variablesFor($key);
        $values = [];
        foreach (self::FIELDS as $field) {
            $value = $input[$field] ?? null;
            $value = is_string($value) ? str_replace("\r\n", "\n", trim($value)) : null;
            $value = $value === '' ? null : $value;
            if ($value !== null) {
                if (EmailTemplateRenderer::containsHtml($value)) {
                    throw DomainException::because('notifications.errors.html_not_allowed', [], $field);
                }
                preg_match_all('/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/u', $value, $matches);
                foreach ($matches[1] as $name) {
                    if (! in_array($name, $allowed, true)) {
                        throw DomainException::because('notifications.errors.unknown_variable', ['name' => $name], $field);
                    }
                }
            }
            $values[$field] = $value;
        }

        return $values;
    }

    private function isCustomized(?EmailTemplate $template): bool
    {
        if ($template === null) {
            return false;
        }
        foreach (self::FIELDS as $field) {
            if (is_string($template->{$field}) && trim($template->{$field}) !== '') {
                return true;
            }
        }

        return false;
    }

    private function moduleLabel(string $module): string
    {
        $name = config('ev.modules.'.$module.'.name');
        if (is_array($name)) {
            return (string) ($name[app()->getLocale()] ?? $name['en'] ?? $module);
        }

        return $module;
    }
}
