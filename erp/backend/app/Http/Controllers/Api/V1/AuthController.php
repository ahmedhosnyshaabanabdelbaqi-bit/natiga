<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Shared\AuditLogger;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class AuthController extends ApiController
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'username' => ['required', 'string', 'max:60'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:100'],
        ]);

        // حماية من تخمين كلمات المرور
        $throttleKey = strtolower($data['username']).'|'.$request->ip();

        if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
            return response()->json([
                'error_code' => 'auth.throttled',
                'message' => 'محاولات كثيرة. حاول بعد '.RateLimiter::availableIn($throttleKey).' ثانية.',
            ], 429);
        }

        $user = User::where('username', $data['username'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            RateLimiter::hit($throttleKey, 300);

            return response()->json([
                'error_code' => 'auth.invalid_credentials',
                'message' => 'اسم المستخدم أو كلمة المرور غير صحيحة.',
            ], 401);
        }

        if (! $user->is_active) {
            return response()->json([
                'error_code' => 'auth.inactive',
                'message' => 'الحساب موقوف. راجع مدير النظام.',
            ], 403);
        }

        RateLimiter::clear($throttleKey);

        $user->last_login_at = now();
        $user->save();

        $token = $user->createToken($data['device_name'] ?? 'web')->plainTextToken;

        $this->audit->log('login', 'user', (int) $user->id, $user->username, companyId: (int) $user->company_id);

        return $this->ok([
            'token' => $token,
            'must_change_password' => (bool) $user->must_change_password,
            'user' => $this->profile($user),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return $this->ok($this->profile($request->user()));
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return $this->ok(['message' => 'تم تسجيل الخروج.']);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'new_password' => ['required', 'string', 'min:12', 'confirmed'],
        ]);

        $user = $request->user();

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => 'كلمة المرور الحالية غير صحيحة.',
            ]);
        }

        $user->password = $data['new_password'];
        $user->must_change_password = false;
        $user->save();

        // إبطال كل الجلسات الأخرى بعد تغيير كلمة المرور
        $user->tokens()->where('id', '!=', $user->currentAccessToken()?->id)->delete();

        $this->audit->log('change_password', 'user', (int) $user->id, $user->username, companyId: (int) $user->company_id);

        return $this->ok(['message' => 'تم تغيير كلمة المرور.']);
    }

    private function profile(User $user): array
    {
        $salesman = $user->salesman;

        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'email' => $user->email,
            'locale' => $user->locale,
            'company_id' => $user->company_id,
            'company_name' => $user->company?->name_ar,
            'branch_id' => $user->branch_id,
            'is_super_admin' => (bool) $user->is_super_admin,
            'roles' => $user->roles()->get(['roles.id', 'roles.code', 'roles.name_ar']),
            // الواجهة تبني القوائم والأزرار من هذه القائمة، والسيرفر يتحقق مجددًا
            'permissions' => array_keys($user->permissionCodes()),
            'salesman' => $salesman ? [
                'id' => $salesman->id,
                'code' => $salesman->code,
                'warehouse_id' => $salesman->warehouse_id,
                'primary_role' => $salesman->primary_role,
            ] : null,
            'scopes' => [
                'branch' => $user->scopeIds('branch'),
                'warehouse' => $user->scopeIds('warehouse'),
                'region' => $user->scopeIds('region'),
            ],
            'can_see_cost' => $user->canSeeCost(),
        ];
    }
}
