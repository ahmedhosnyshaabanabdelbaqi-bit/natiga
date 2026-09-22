{{--
    Base layout for every PDF (App\Support\Pdf\PdfService). Variables injected by the service:
    $pdfLocale, $pdfDir, $pdfFont, $pdfSiteName, $pdfGeneratedAt. Views pass $title.
--}}
@php
    $isRtl = ($pdfDir ?? 'rtl') === 'rtl';
    $documentTitle = $title ?? '';
@endphp
<!DOCTYPE html>
<html lang="{{ $pdfLocale }}" dir="{{ $pdfDir }}">
<head>
    <meta charset="utf-8">
    <title>{{ $documentTitle !== '' ? $documentTitle.' - ' : '' }}{{ $pdfSiteName }}</title>
    <style>
        body { font-family: '{{ $pdfFont }}', 'dejavusans', sans-serif; font-size: 10pt; color: #0B1220; line-height: 1.5; }
        h1 { font-size: 16pt; margin: 0 0 6pt; color: #0B1220; }
        h2 { font-size: 12.5pt; margin: 14pt 0 6pt; color: #0F766E; }
        p { margin: 0 0 6pt; }
        .muted { color: #64748B; }
        .small { font-size: 8.5pt; }
        .brand { font-size: 12pt; font-weight: bold; color: #0B1220; }
        .accent { color: #0F766E; }
        .code { font-family: 'dejavusansmono', monospace; direction: ltr; unicode-bidi: embed; }
        .text-start { text-align: {{ $isRtl ? 'right' : 'left' }}; }
        .text-end { text-align: {{ $isRtl ? 'left' : 'right' }}; }
        .text-center { text-align: center; }
        table.header, table.footer { width: 100%; border-collapse: collapse; }
        table.header td { padding: 0 0 6pt; border-bottom: 1.5pt solid #0F766E; vertical-align: bottom; }
        table.footer td { padding: 6pt 0 0; border-top: 0.75pt solid #CBD5E1; color: #64748B; font-size: 8pt; }
        table.data { width: 100%; border-collapse: collapse; margin: 6pt 0 10pt; }
        table.data th { background: #F1F5F9; color: #0B1220; font-weight: bold; padding: 5pt 6pt; border: 0.5pt solid #CBD5E1; font-size: 9.5pt; }
        table.data td { padding: 5pt 6pt; border: 0.5pt solid #E2E8F0; vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; }
        table.data tr.total td { background: #F8FAFC; font-weight: bold; }
        .box { border: 0.5pt solid #CBD5E1; padding: 8pt 10pt; margin: 6pt 0; }
        .badge { display: inline-block; padding: 1pt 6pt; border: 0.5pt solid #0F766E; color: #0F766E; border-radius: 3pt; font-size: 8.5pt; }
        @yield('styles')
    </style>
</head>
<body>
<htmlpageheader name="ev-header">
    <table class="header">
        <tr>
            <td class="brand text-start" style="width: 55%">{{ $pdfSiteName }}</td>
            <td class="text-end muted">{{ $documentTitle }}</td>
        </tr>
    </table>
</htmlpageheader>
<htmlpagefooter name="ev-footer">
    <table class="footer">
        <tr>
            <td class="text-start" style="width: 60%">{{ __('pdf.generated_at', ['date' => $pdfGeneratedAt->translatedFormat('j F Y H:i')]) }}</td>
            <td class="text-end">{{ __('pdf.page_of', ['page' => '{PAGENO}', 'total' => '{nbpg}']) }}</td>
        </tr>
    </table>
</htmlpagefooter>
<sethtmlpageheader name="ev-header" value="on" show-this-page="1" />
<sethtmlpagefooter name="ev-footer" value="on" />

@yield('content')
</body>
</html>
