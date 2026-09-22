@php
    /*
     * Maintenance page (HTTP 503). Rendered by `php artisan down --render="errors::503"` (pre-rendered into
     * storage/framework/maintenance.php, served before the framework boots) and by the exception handler for JSON-less
     * 503 responses. Self-contained: no Vite assets, no scripts, no technical details. Settings are read defensively
     * because the database or cache may be the reason for the maintenance window.
     */
    $safe = static function (callable $read, mixed $fallback): mixed {
        try {
            $value = $read();

            return $value === null || $value === '' ? $fallback : $value;
        } catch (\Throwable) {
            return $fallback;
        }
    };
    $setting = static fn (string $key, mixed $fallback) => $safe(fn () => \App\Modules\System\Services\Settings::get($key), $fallback);
    $hex = static fn (mixed $value, string $fallback) => is_string($value) && preg_match('/^#[0-9A-Fa-f]{6}$/', $value) ? $value : $fallback;

    $primary = $hex($setting('branding.primary_color', '#0B1220'), '#0B1220');
    $accent = $hex($setting('branding.accent_color', '#0F766E'), '#0F766E');
    $background = $hex($setting('branding.background_color', '#F8FAFC'), '#F8FAFC');
    $logo = $setting('branding.logo_path', null);
    $logo = is_string($logo) && str_starts_with($logo, '/storage/branding/') ? $logo : null;
    $siteAr = (string) $setting('branding.site_name_ar', 'مجتمع السيارات الكهربائية في مصر');
    $siteEn = (string) $setting('branding.site_name_en', 'EV Community Egypt');
    $messageAr = (string) $setting('system.maintenance_message_ar', 'الموقع تحت الصيانة حاليًا، سنعود قريبًا.');
    $messageEn = (string) $setting('system.maintenance_message_en', 'The platform is under maintenance. We will be back shortly.');
    $email = $setting('general.contact_email', null);
    $phone = $setting('general.contact_phone', null);
@endphp
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <meta name="theme-color" content="{{ $primary }}">
    <title>{{ $siteAr }} — {{ $siteEn }}</title>
    <style>
        :root { --primary: {{ $primary }}; --accent: {{ $accent }}; --bg: {{ $background }}; }
        * { box-sizing: border-box; }
        html, body { margin: 0; min-height: 100%; }
        body {
            min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px 16px;
            background: var(--bg); color: var(--primary);
            font-family: "Cairo", "Segoe UI", Tahoma, "Noto Sans Arabic", system-ui, -apple-system, sans-serif; line-height: 1.7;
        }
        main { width: 100%; max-width: 560px; background: #fff; border-radius: 16px; padding: 32px 28px; box-shadow: 0 10px 30px rgba(11, 18, 32, .08); border-top: 4px solid var(--accent); }
        .logo { display: block; max-height: 56px; max-width: 220px; margin: 0 auto 20px; }
        .badge { display: inline-block; font-size: 13px; font-weight: 700; letter-spacing: .02em; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); padding: 4px 12px; border-radius: 999px; }
        section { text-align: center; }
        section + section { margin-top: 24px; padding-top: 24px; border-top: 1px solid rgba(11, 18, 32, .08); }
        h1 { font-size: 22px; margin: 12px 0 8px; }
        p { margin: 0; font-size: 16px; color: rgba(11, 18, 32, .78); }
        .en { font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif; }
        .contact { margin-top: 24px; font-size: 14px; text-align: center; color: rgba(11, 18, 32, .65); }
        .contact a { color: var(--accent); text-decoration: none; }
        @media (prefers-color-scheme: dark) {
            body { background: #0b1220; color: #e2e8f0; }
            main { background: #111a2e; box-shadow: none; }
            p, .contact { color: rgba(226, 232, 240, .8); }
            section + section { border-top-color: rgba(226, 232, 240, .12); }
        }
    </style>
</head>
<body>
<main role="main">
    @if ($logo)
        <img class="logo" src="{{ $logo }}" alt="{{ $siteAr }}">
    @endif
    <section lang="ar" dir="rtl">
        <span class="badge">صيانة مجدولة</span>
        <h1>{{ $siteAr }}</h1>
        <p>{{ $messageAr }}</p>
    </section>
    <section lang="en" dir="ltr" class="en">
        <span class="badge">Scheduled maintenance</span>
        <h1>{{ $siteEn }}</h1>
        <p>{{ $messageEn }}</p>
    </section>
    @if (is_string($email) || is_string($phone))
        <div class="contact">
            @if (is_string($email))
                <a href="mailto:{{ $email }}" dir="ltr">{{ $email }}</a>
            @endif
            @if (is_string($email) && is_string($phone))
                ·
            @endif
            @if (is_string($phone))
                <a href="tel:{{ preg_replace('/[^0-9+]/', '', $phone) }}" dir="ltr">{{ $phone }}</a>
            @endif
        </div>
    @endif
</main>
</body>
</html>
