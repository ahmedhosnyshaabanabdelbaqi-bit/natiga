<?php

namespace App\Modules\Notifications\Http\Controllers\Member;

use App\Http\Controllers\Controller;
use App\Modules\Notifications\Http\Requests\UpdatePreferencesRequest;
use App\Modules\Notifications\Services\NotificationPreferences;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** `/account/notification-preferences`: category × channel matrix + SMS/WhatsApp consent (own account only). */
class PreferencesController extends Controller
{
    public function edit(Request $request): Response
    {
        return Inertia::render('member/notifications/preferences', [
            'matrix' => NotificationPreferences::matrix($request->user()),
        ]);
    }

    public function update(UpdatePreferencesRequest $request): RedirectResponse|JsonResponse
    {
        $user = $request->user();
        $changes = NotificationPreferences::update(
            $user,
            (array) $request->validated('preferences', []),
            $user,
            (array) $request->validated('consents', []),
        );

        if ($request->expectsJson()) {
            return response()->json(['data' => ['changed' => array_keys($changes), 'matrix' => NotificationPreferences::matrix($user)]]);
        }

        return back()->with('success', __('notifications.preferences.saved'));
    }
}
