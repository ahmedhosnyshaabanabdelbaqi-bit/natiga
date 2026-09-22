@extends('mail.layout')

@section('content')
    <p>{{ $greeting }}</p>
    {!! $bodyHtml !!}
    @if($actionUrl)
        <p style="margin-top: 22px;"><a class="button" href="{{ $actionUrl }}">{{ __('notifications.mail.open', [], $locale) }}</a></p>
    @endif
@endsection

@section('footer')
    <p>{{ __('notifications.mail.footer', ['site' => $siteName], $locale) }}</p>
    @if($isMarketing)
        <p>{{ __('notifications.mail.marketing_footer', [], $locale) }} <a href="{{ $preferencesUrl }}">{{ __('notifications.mail.manage_preferences', [], $locale) }}</a></p>
    @else
        <p><a href="{{ $preferencesUrl }}">{{ __('notifications.mail.manage_preferences', [], $locale) }}</a></p>
    @endif
@endsection
