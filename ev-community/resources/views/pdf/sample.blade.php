{{--
    Reference document used by `php artisan pdf:test` and the PdfService unit tests.
    Data (see PdfTestCommand::sampleData): $title, $intro, $reference, $items[] (name, sku, quantity,
    unit_price_formatted, line_total_formatted), $grand_total_formatted, $notes, $qr (data URI, optional).
--}}
@extends('pdf.layout')

@section('content')
    <h1>{{ $title }}</h1>
    <p class="muted">{{ $intro }}</p>

    <div class="box">
        <span class="badge">{{ __('pdf.sample.reference') }}</span>
        <span class="code">{{ $reference }}</span>
        @if(!empty($qr))
            <div class="text-center" style="margin-top: 6pt"><img src="{{ $qr }}" width="96" height="96" alt=""></div>
        @endif
    </div>

    <h2>{{ __('pdf.sample.items') }}</h2>
    <table class="data">
        <thead>
            <tr>
                <th class="text-start" style="width: 46%">{{ __('pdf.sample.columns.item') }}</th>
                <th class="text-start" style="width: 18%">{{ __('pdf.sample.columns.sku') }}</th>
                <th class="text-center" style="width: 10%">{{ __('pdf.sample.columns.quantity') }}</th>
                <th class="text-end" style="width: 13%">{{ __('pdf.sample.columns.unit_price') }}</th>
                <th class="text-end" style="width: 13%">{{ __('pdf.sample.columns.total') }}</th>
            </tr>
        </thead>
        <tbody>
            @foreach($items as $item)
                <tr>
                    <td class="text-start">{{ $item['name'] }}</td>
                    <td class="code">{{ $item['sku'] }}</td>
                    <td class="text-center">{{ $item['quantity'] }}</td>
                    <td class="text-end">{{ $item['unit_price_formatted'] }}</td>
                    <td class="text-end">{{ $item['line_total_formatted'] }}</td>
                </tr>
            @endforeach
            <tr class="total">
                <td colspan="4" class="text-end">{{ __('pdf.sample.grand_total') }}</td>
                <td class="text-end">{{ $grand_total_formatted }}</td>
            </tr>
        </tbody>
    </table>

    @if(!empty($notes))
        <h2>{{ __('pdf.sample.notes') }}</h2>
        <p>{{ $notes }}</p>
    @endif
@endsection
