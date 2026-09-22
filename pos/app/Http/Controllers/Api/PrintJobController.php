<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Modules\Printing\Services\PrintService;
use App\Modules\Sync\Models\PrintJob;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * The print queue. A failed print is fixed here, on its own, and never by
 * re-running the sale.
 */
class PrintJobController extends Controller
{
    public function __construct(private readonly PrintService $printing) {}

    public function pending(Request $request): JsonResponse
    {
        $terminal = $request->attributes->get('pos.terminal');

        return response()->json($this->printing->pendingFor($terminal?->id));
    }

    public function failed(Request $request): JsonResponse
    {
        $terminal = $request->attributes->get('pos.terminal');

        return response()->json($this->printing->failedFor($terminal?->id));
    }

    public function markPrinted(PrintJob $printJob): JsonResponse
    {
        $this->printing->markPrinted($printJob);

        return response()->json($printJob->refresh());
    }

    public function markFailed(Request $request, PrintJob $printJob): JsonResponse
    {
        $data = $request->validate(['error' => ['required', 'string', 'max:2000']]);

        $this->printing->markFailed($printJob, $data['error']);

        return response()->json($printJob->refresh());
    }

    public function retry(PrintJob $printJob): JsonResponse
    {
        return response()->json($this->printing->retry($printJob));
    }
}
