{{-- text/plain alternative: never rendered as HTML, so values are printed raw (no &amp; entities). --}}
{!! $greeting !!}

{!! $bodyText !!}
@if($actionUrl)

{!! __('notifications.mail.plain_link', ['url' => $actionUrl], $locale) !!}
@endif

--
{!! __('notifications.mail.footer', ['site' => $siteName], $locale) !!}
{!! __('notifications.mail.manage_preferences', [], $locale) !!}: {!! $preferencesUrl !!}
@if($isMarketing)
{!! __('notifications.mail.marketing_footer', [], $locale) !!}
@endif
