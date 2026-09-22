<?php

namespace App\Modules\Integrations\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Integrations\Services\WebhookIngest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * POST /webhooks/{provider} — provider = integration category (payment, shipping, ...).
 * Signature verified by the configured driver; events stored idempotently; processing is queued.
 * Always answers quickly with JSON: 200 (accepted or duplicate), 401 (bad signature), 404 (no such
 * provider / provider not configured for webhooks).
 */
class WebhookController extends Controller
{
    public function handle(string $provider, Request $request, WebhookIngest $ingest): JsonResponse
    {
        $result = $ingest->ingest($provider, $request);
        $requestId = ev_request_id();

        return match ($result['outcome']) {
            WebhookIngest::UNSUPPORTED => response()->json(['received' => false, 'message' => 'unknown provider', 'request_id' => $requestId], 404),
            WebhookIngest::REJECTED => response()->json(['received' => false, 'message' => 'invalid signature', 'request_id' => $requestId], 401),
            WebhookIngest::DUPLICATE => response()->json(['received' => true, 'duplicate' => true, 'request_id' => $requestId], 200),
            default => response()->json(['received' => true, 'duplicate' => false, 'id' => $result['event']?->id, 'request_id' => $requestId], 200),
        };
    }
}
