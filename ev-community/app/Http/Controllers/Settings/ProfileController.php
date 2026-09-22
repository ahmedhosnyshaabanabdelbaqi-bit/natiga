<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\ProfileDeleteRequest;
use App\Http\Requests\Settings\ProfileUpdateRequest;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class ProfileController extends Controller
{
    public function __construct(private readonly AuditService $audit) {}

    /**
     * Show the user's profile settings page.
     */
    public function edit(Request $request): Response
    {
        return Inertia::render('settings/profile', [
            'mustVerifyEmail' => $request->user() instanceof MustVerifyEmail,
            'status' => $request->session()->get('status'),
        ]);
    }

    /**
     * Update the user's name and email. An email change resets verification, is audited,
     * recorded as a security event and triggers a new verification email.
     */
    public function update(ProfileUpdateRequest $request): RedirectResponse
    {
        $user = $request->user();
        $before = ['name' => $user->name, 'email' => $user->email];

        $user->fill($request->validated());
        $emailChanged = $user->isDirty('email');

        if ($emailChanged) {
            $user->email_verified_at = null;
        }

        DB::transaction(function () use ($user, $before, $emailChanged) {
            $user->save();
            $this->audit->logChanges('auth.profile_updated', $user, $before, ['name' => $user->name, 'email' => $user->email], actor: $user);

            if ($emailChanged) {
                SecurityEvents::record($user, 'email_changed', [], 'warning');
            }
        });

        if ($emailChanged && $user instanceof MustVerifyEmail) {
            try {
                $user->sendEmailVerificationNotification();
            } catch (Throwable $e) {
                // The page offers "re-send verification email"; a mail outage must not fail the saved change.
                report($e);
            }
        }

        Inertia::flash('toast', [
            'type' => 'success',
            'message' => $emailChanged ? __('settings.profile.updated_verify_email') : __('settings.profile.updated'),
        ]);

        return to_route('profile.edit');
    }

    /**
     * Accounts are never hard-deleted from self-service: orders, payments, receipts and the audit
     * trail must survive (docs/SECURITY.md "deactivate ≠ delete"). Members are sent to the privacy
     * page (deactivation / personal-data deletion request, handled by the Members module); staff and
     * partner accounts are deactivated by administrators.
     */
    public function destroy(ProfileDeleteRequest $request): RedirectResponse
    {
        $user = $request->user();
        SecurityEvents::record($user, 'account_self_delete_refused', [], 'warning');

        if ($user->isMember()) {
            return to_route('member.privacy.index')->with('warning', __('settings.delete_account.not_allowed'));
        }

        abort(403, __('settings.delete_account.not_allowed_staff'));
    }
}
