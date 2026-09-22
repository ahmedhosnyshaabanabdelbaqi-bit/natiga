<?php

namespace App\Http\Middleware;

use App\Modules\System\Models\StatusBanner;
use App\Modules\System\Services\Modules;
use App\Modules\System\Services\Settings;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    protected $rootView = 'app';

    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $user = $request->user();
        $locale = app()->getLocale();
        $space = $this->space($request);

        return [
            ...parent::share($request),
            'name' => Settings::localized('branding.site_name', $locale, config('app.name')),
            'locale' => $locale,
            'dir' => ev_dir($locale),
            'space' => $space,
            'auth' => [
                'user' => $user ? [
                    'id' => $user->public_id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'mobile' => $user->mobile,
                    'preferred_locale' => $user->preferred_locale,
                    'email_verified_at' => $user->email_verified_at?->toIso8601String(),
                    'two_factor_enabled' => $user->hasMfaEnabled(),
                    'is_staff' => $user->isStaff(),
                    'is_partner' => $user->isPartnerUser(),
                    'is_member' => $user->relationLoaded('membership') ? $user->membership !== null : $user->isMember(),
                    'membership' => $user->membership ? [
                        'id' => $user->membership->public_id,
                        'member_number' => $user->membership->member_number,
                        'status' => $user->membership->status->value,
                    ] : null,
                ] : null,
                'roles' => $user ? $user->getRoleNames()->values()->all() : [],
                'permissions' => $user ? $user->permissionNames() : [],
            ],
            'branding' => fn () => [
                'site_name' => Settings::localized('branding.site_name', $locale),
                'tagline' => Settings::localized('branding.tagline', $locale),
                'logo' => Settings::get('branding.logo_path'),
                'logo_dark' => Settings::get('branding.logo_dark_path'),
                'primary_color' => Settings::get('branding.primary_color'),
                'accent_color' => Settings::get('branding.accent_color'),
                'background_color' => Settings::get('branding.background_color'),
                'contact' => [
                    'email' => Settings::get('general.contact_email'),
                    'phone' => Settings::get('general.contact_phone'),
                    'whatsapp' => Settings::get('general.contact_whatsapp'),
                    'address' => Settings::localized('general.address', $locale),
                    'social' => Settings::get('general.social_links', []),
                ],
            ],
            'modules' => fn () => Modules::enabledMap(),
            'banners' => fn () => $this->banners($space, $locale),
            'flash' => [
                'success' => $request->session()->get('success'),
                'error' => $request->session()->get('error'),
                'status' => $request->session()->get('status'),
                'warning' => $request->session()->get('warning'),
            ],
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
            'csrf' => csrf_token(),
        ];
    }

    private function space(Request $request): string
    {
        return match (true) {
            $request->is('admin', 'admin/*') => 'admin',
            $request->is('partner', 'partner/*') => 'partner',
            $request->is('account', 'account/*') => 'member',
            $request->is('settings', 'settings/*') => match (true) {
                $request->user()?->isMember() => 'member',
                $request->user()?->isStaff() => 'admin',
                $request->user()?->isPartnerUser() => 'partner',
                default => 'member',
            },
            default => 'public',
        };
    }

    private function banners(string $space, string $locale): array
    {
        try {
            return StatusBanner::query()->current($space)->limit(2)->get()
                ->map(fn ($b) => ['id' => $b->id, 'level' => $b->level, 'message' => $locale === 'ar' ? $b->message_ar : $b->message_en])->all();
        } catch (\Throwable) {
            return [];
        }
    }
}
