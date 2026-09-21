<?php

namespace App\Http\Controllers\Api;

use App\Models\Device;
use App\Models\User;
use App\Support\CompanyContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:120'],
            'device_uid' => ['nullable', 'string', 'max:128'],
            'platform' => ['nullable', 'string', 'max:24'],
            'app_version' => ['nullable', 'string', 'max:24'],
        ]);

        $user = User::withoutGlobalScope('company')->where('email', $data['email'])->first();

        // One generic message for both "no such user" and "wrong password", so
        // the endpoint does not confirm which addresses exist.
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['بيانات الدخول غير صحيحة.'],
            ]);
        }

        if (! $user->is_active) {
            return response()->json([
                'error' => 'auth.inactive',
                'message' => 'الحساب موقوف. تواصل مع مسؤول النظام.',
            ], 403);
        }

        CompanyContext::set($user->company_id);

        $device = null;
        if (! empty($data['device_uid'])) {
            $device = Device::updateOrCreate(
                ['company_id' => $user->company_id, 'device_uid' => $data['device_uid']],
                [
                    'user_id' => $user->id,
                    'label' => $data['device_name'] ?? null,
                    'platform' => $data['platform'] ?? 'android',
                    'app_version' => $data['app_version'] ?? null,
                    'last_seen_at' => now(),
                ]
            );

            if ($device->status === 'blocked') {
                return response()->json([
                    'error' => 'auth.device_blocked',
                    'message' => 'هذا الجهاز موقوف عن الاستخدام.',
                ], 403);
            }
        }

        $user->forceFill(['last_login_at' => now()])->save();

        $token = $user->createToken(
            $data['device_name'] ?? 'web',
            $user->permissionCodes()->all()
        );

        return response()->json([
            'token' => $token->plainTextToken,
            'user' => $this->userPayload($user),
            'device_id' => $device?->id,
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->userPayload($request->user())]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'تم تسجيل الخروج.']);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user = $request->user();

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['كلمة المرور الحالية غير صحيحة.'],
            ]);
        }

        $user->forceFill([
            'password' => $data['password'],
            'must_change_password' => false,
        ])->save();

        // Every other session for this user is invalidated on a password change.
        $user->tokens()->where('id', '!=', $user->currentAccessToken()->id)->delete();

        return response()->json(['message' => 'تم تغيير كلمة المرور.']);
    }

    protected function userPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'company_id' => $user->company_id,
            'branch_id' => $user->branch_id,
            'locale' => $user->locale,
            'job_title' => $user->job_title,
            'is_super_admin' => $user->is_super_admin,
            'must_change_password' => $user->must_change_password,
            'roles' => $user->roles->map(fn ($r) => ['code' => $r->code, 'name' => $r->name]),
            'permissions' => $user->permissionCodes()->values(),
            'scopes' => [
                'branch' => $user->scopeIds('branch'),
                'warehouse' => $user->scopeIds('warehouse'),
                'region' => $user->scopeIds('region'),
            ],
        ];
    }
}
