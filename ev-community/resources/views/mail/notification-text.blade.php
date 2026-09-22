{{ $greeting }}

{{ $bodyText }}
@if($actionUrl)

{{ __('notifications.mail.plain_link', ['url' => $actionUrl], $locale) }}
@endif

--
{{ __('notifications.mail.footer', ['site' => $siteName], $locale) }}
{{ __('notifications.mail.manage_preferences', [], $locale) }}: {{ $preferencesUrl }}
