<?php

use App\Modules\Integrations\Http\Controllers\WebhookController;
use App\Modules\Integrations\Services\IntegrationManager;
use Illuminate\Support\Facades\Route;

// POST /webhooks/{provider} — provider is the integration category; drivers that do not accept
// webhooks (or are not configured) answer 404 from the controller.
Route::post('{provider}', [WebhookController::class, 'handle'])
    ->where('provider', implode('|', IntegrationManager::CATEGORIES))
    ->name('handle');
