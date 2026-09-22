<!DOCTYPE html>
<html lang="{{ app()->getLocale() }}" dir="{{ app()->getLocale() === 'ar' ? 'rtl' : 'ltr' }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
    <meta name="color-scheme" content="light dark">
    {{-- لون شريط المتصفح يتبع الوضع، فلا يظهر شريط أبيض فوق شاشة معتمة --}}
    <meta name="theme-color" content="#f4f6f9" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#0a111e" media="(prefers-color-scheme: dark)">
    <meta name="description" content="نظام إدارة المحلات الصغيرة — نقطة بيع سريعة بمخزون وحسابات مترابطة.">
    <title>{{ config('app.name') }}</title>

    <link rel="icon" href="/icons/icon-192.png" type="image/png">
    <link rel="apple-touch-icon" href="/icons/icon-192.png">

    {{-- الخط مستضاف محليًا: لا طلب خارجي، فالواجهة كاملة حتى دون إنترنت --}}
    <link rel="preload" href="/fonts/cairo-arabic-400.woff2" as="font" type="font/woff2" crossorigin>

    {{-- خلفية مبكرة تمنع الوميض قبل تحميل CSS --}}
    <style>
        html { background: #f4f6f9; }
        @media (prefers-color-scheme: dark) { html { background: #0a111e; } }
        html[data-theme="dark"] { background: #0a111e; }
        html[data-theme="light"] { background: #f4f6f9; }
    </style>

    @vite(['resources/css/app.css', 'resources/js/app.ts'])
</head>
<body>
    <div id="app"></div>
    <noscript>
        <p style="padding:2rem;text-align:center;font-family:system-ui">
            هذا النظام يحتاج تفعيل JavaScript في المتصفح.
        </p>
    </noscript>
</body>
</html>
