<!DOCTYPE html>
@php
    $locale = app()->getLocale();
    $dir = ev_dir($locale);
    $branding = [
        'primary' => \App\Modules\System\Services\Settings::get('branding.primary_color', '#0B1220'),
        'accent' => \App\Modules\System\Services\Settings::get('branding.accent_color', '#0F766E'),
        'background' => \App\Modules\System\Services\Settings::get('branding.background_color', '#F8FAFC'),
        'favicon' => \App\Modules\System\Services\Settings::get('branding.favicon_path'),
    ];
    $boot = [
        'locale' => $locale,
        'dir' => $dir,
        'locales' => collect(config('ev.locales'))->map(fn ($l, $k) => ['code' => $k, 'name' => $l['name'], 'dir' => $l['dir']])->values(),
        'translations' => app(\App\Modules\Auth\Services\TranslationExporter::class)->forLocale($locale),
        'map' => [
            'provider' => config('ev.map.provider'),
            'public_key' => config('ev.map.public_key'),
            'tile_url' => config('ev.map.tile_url'),
            'default' => ['lat' => config('ev.map.default_lat'), 'lng' => config('ev.map.default_lng'), 'zoom' => config('ev.map.default_zoom')],
        ],
        'timezone' => config('app.timezone'),
        'currency' => config('ev.base_currency'),
    ];
@endphp
<html lang="{{ $locale }}" dir="{{ $dir }}" @class(['dark' => ($appearance ?? 'system') == 'dark'])>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
        <meta name="csrf-token" content="{{ csrf_token() }}">
        <meta name="theme-color" content="{{ $branding['primary'] }}">
        @if(request()->is('admin*') || request()->is('partner*') || request()->is('account*') || request()->is('settings*') || request()->is('files/*'))
        <meta name="robots" content="noindex, nofollow">
        @endif

        <script>
            (function() {
                const appearance = '{{ $appearance ?? "system" }}';
                if (appearance === 'system') {
                    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                        document.documentElement.classList.add('dark');
                    }
                }
            })();
        </script>

        <style>
            :root { --brand-primary: {{ $branding['primary'] }}; --brand-accent: {{ $branding['accent'] }}; --brand-background: {{ $branding['background'] }}; }
            html { background-color: {{ $branding['background'] }}; }
            html.dark { background-color: #0b1220; }
        </style>

        <link rel="icon" href="{{ $branding['favicon'] ?: '/favicon.ico' }}" sizes="any">
        <link rel="icon" href="/favicon.svg" type="image/svg+xml">
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">

        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

        <script>window.__EV__ = @json($boot, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);</script>

        @viteReactRefresh
        @vite(['resources/css/app.css', 'resources/js/app.tsx', "resources/js/pages/{$page['component']}.tsx"])
        <x-inertia::head>
            <title>{{ \App\Modules\System\Services\Settings::localized('branding.site_name', $locale, config('app.name')) }}</title>
        </x-inertia::head>
    </head>
    <body class="font-sans antialiased" data-locale="{{ $locale }}">
        <x-inertia::app />
    </body>
</html>
