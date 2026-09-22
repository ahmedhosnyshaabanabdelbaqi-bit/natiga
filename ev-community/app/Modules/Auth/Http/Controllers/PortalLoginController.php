<?php

namespace App\Modules\Auth\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Laravel\Fortify\Features;

/**
 * Separate login screens for the admin and partner portals. They post to Fortify's /login;
 * the chosen portal is remembered in the session and used by LoginResponse.
 */
class PortalLoginController extends Controller
{
    public function admin(Request $request): Response|RedirectResponse
    {
        return $this->render($request, 'admin');
    }

    public function partner(Request $request): Response|RedirectResponse
    {
        return $this->render($request, 'partner');
    }

    private function render(Request $request, string $portal): Response|RedirectResponse
    {
        if ($request->user()) {
            return redirect()->to(config("ev.portals.{$portal}.home"));
        }
        $request->session()->put('auth.portal', $portal);

        return Inertia::render('auth/login', [
            'portal' => $portal,
            'canResetPassword' => Features::enabled(Features::resetPasswords()),
            'canRegister' => false,
            'status' => $request->session()->get('status'),
        ]);
    }
}
