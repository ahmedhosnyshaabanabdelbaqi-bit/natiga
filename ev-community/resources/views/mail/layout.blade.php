<!DOCTYPE html>
<html lang="{{ $locale }}" dir="{{ $dir }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>{{ $subject }}</title>
    <style>
        body { margin: 0; padding: 0; background: {{ $backgroundColor }}; -webkit-text-size-adjust: 100%; }
        .wrapper { width: 100%; background: {{ $backgroundColor }}; padding: 24px 0; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
        .header { background: {{ $primaryColor }}; color: #ffffff; padding: 20px 28px; font-size: 18px; font-weight: 700; }
        .header img { max-height: 36px; vertical-align: middle; }
        .content { padding: 28px; color: #0f172a; font-size: 15px; line-height: 1.7; }
        .content p { margin: 0 0 14px; }
        .content a { color: {{ $accentColor }}; }
        .button { display: inline-block; background: {{ $accentColor }}; color: #ffffff !important; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: 600; }
        .footer { padding: 18px 28px; color: #64748b; font-size: 12px; line-height: 1.6; border-top: 1px solid #e2e8f0; }
        .footer a { color: #64748b; }
        [dir="rtl"] .content, [dir="rtl"] .footer, [dir="rtl"] .header { text-align: right; }
        [dir="ltr"] .content, [dir="ltr"] .footer, [dir="ltr"] .header { text-align: left; }
    </style>
</head>
<body style="font-family: {{ $locale === 'ar' ? "'Cairo', Tahoma, Arial, sans-serif" : "'Inter', Arial, Helvetica, sans-serif" }};">
    <div class="wrapper">
        <div class="container">
            <div class="header">
                @if($logoUrl)
                    <img src="{{ $logoUrl }}" alt="{{ $siteName }}">
                @else
                    {{ $siteName }}
                @endif
            </div>
            <div class="content">
                @yield('content')
            </div>
            <div class="footer">
                @yield('footer')
                <p>&copy; {{ $year }} {{ $siteName }}. {{ __('notifications.mail.rights', [], $locale) }}</p>
            </div>
        </div>
    </div>
</body>
</html>
