<?php

namespace App\Modules\System\Services;

use App\Models\User;
use App\Modules\Rbac\Services\PermissionRegistry;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Permission;

/**
 * First-run checklist shown at /admin/setup. Every item is computed from the database/config when the page
 * renders; nothing is stored. Links point to the page where the operator fixes the item.
 */
final class SetupChecklist
{
    /** @return array<int, array{key: string, ok: bool, href: string, detail: ?string}> */
    public function items(): array
    {
        $owners = User::query()->role('owner')->where('status', User::STATUS_ACTIVE)->get();
        $ownerWithMfa = $owners->contains(fn (User $u) => $u->hasMfaEnabled());
        $registryPermissions = array_keys(PermissionRegistry::permissions());
        $existingPermissions = Permission::query()->whereIn('name', $registryPermissions)->count();
        $mailer = (string) config('mail.default', 'log');
        $fromAddress = (string) config('mail.from.address', '');
        $placeholderPolicies = DB::table('policy_versions')->whereIn('type', ['terms', 'privacy'])
            ->where(fn ($q) => $q->where('content_en', 'like', '%Initial draft%')->orWhere('content_ar', 'like', '%نسخة أولية%'))->count();
        $policyTypes = DB::table('policy_versions')->whereIn('type', ['terms', 'privacy'])->whereNotNull('published_at')->distinct()->count('type');

        return [
            $this->item('owner_exists', $owners->isNotEmpty(), '/admin/users', $owners->isNotEmpty() ? $owners->pluck('email')->implode(', ') : null),
            $this->item('owner_mfa', $ownerWithMfa, '/settings/security'),
            $this->item('branding', Settings::get('branding.logo_path') !== null && Settings::get('branding.site_name_en') !== null, '/admin/settings?group=branding'),
            $this->item('contact_info', (bool) Settings::get('general.contact_email') && (bool) Settings::get('general.contact_phone'), '/admin/settings?group=general'),
            $this->item('currencies', DB::table('currencies')->where('is_active', true)->where('is_base', true)->exists(), '/admin/settings?group=general', (string) config('ev.base_currency')),
            $this->item('email', ! in_array($mailer, ['log', 'array', 'null', 'failover'], true) && ! str_ends_with($fromAddress, '@example.com'), '/admin/integrations', $mailer),
            $this->item('maps', (string) config('ev.map.provider', 'none') !== 'none', '/admin/integrations', (string) config('ev.map.provider')),
            $this->item('registration_mode', DB::table('system_settings')->where('key', 'members.registration_mode')->exists(), '/admin/settings?group=members', (string) Settings::get('members.registration_mode')),
            $this->item('roles_synced', $existingPermissions === count($registryPermissions), '/admin/roles', $existingPermissions.'/'.count($registryPermissions)),
            $this->item('modules_reviewed', DB::table('module_settings')->count() >= count(config('ev.modules', [])), '/admin/modules'),
            $this->item('policies', $policyTypes >= 2 && $placeholderPolicies === 0, '/admin/cms'),
        ];
    }

    /** @return array{key: string, ok: bool, href: string, detail: ?string} */
    private function item(string $key, bool $ok, string $href, ?string $detail = null): array
    {
        return ['key' => $key, 'ok' => $ok, 'href' => $href, 'detail' => $detail];
    }
}
