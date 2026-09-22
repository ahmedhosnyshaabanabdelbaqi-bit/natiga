<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\User;
use App\Modules\Access\Services\AuditService;
use App\Modules\Access\Services\PermissionService;
use App\Modules\Core\Models\Terminal;
use App\Modules\Core\Services\SettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * Sign-in for the POS and the back office.
 *
 * Two paths: full credentials (username/email + password) and a cashier PIN used
 * to unlock a locked till screen. Both are rate limited and both lock the account
 * after repeated failures.
 */
class AuthController extends Controller
{
    public function __construct(
        private readonly PermissionService $permissions,
        private readonly SettingsService $settings,
        private readonly AuditService $audit,
    ) {}

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'username' => ['required', 'string', 'max:120'],
            'password' => ['required', 'string'],
            'terminal_code' => ['nullable', 'string', 'max:32'],
            'device_name' => ['nullable', 'string', 'max:120'],
        ]);

        $throttleKey = 'login:'.mb_strtolower($data['username']).'|'.$request->ip();

        if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
            throw ValidationException::withMessages([
                'username' => ['محاولات كثيرة. حاول بعد '.RateLimiter::availableIn($throttleKey).' ثانية.'],
            ])->status(429);
        }

        $user = User::query()
            ->where('username', $data['username'])
            ->orWhere('email', $data['username'])
            ->first();

        if (! $user || ! Hash::check($data['password'], (string) $user->password)) {
            RateLimiter::hit($throttleKey, 300);
            $user?->increment('failed_login_attempts');

            throw ValidationException::withMessages(['username' => ['بيانات الدخول غير صحيحة.']]);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages(['username' => ['الحساب غير مفعل.']]);
        }

        if ($user->locked_until && $user->locked_until->isFuture()) {
            throw ValidationException::withMessages(['username' => ['الحساب موقوف مؤقتًا.']]);
        }

        RateLimiter::clear($throttleKey);

        $terminal = isset($data['terminal_code'])
            ? Terminal::query()->where('code', $data['terminal_code'])->first()
            : null;

        $user->forceFill(['last_login_at' => now(), 'failed_login_attempts' => 0])->save();

        $token = $user->createToken($data['device_name'] ?? ($terminal?->code ?? 'pos'), ['*']);

        $this->audit->log('auth.login', $user, null, ['terminal' => $terminal?->code]);

        return response()->json([
            'token' => $token->plainTextToken,
            'user' => $this->userPayload($user, $terminal),
        ]);
    }

    /** Fast re-entry on a locked till: PIN only, and only for the same terminal. */
    public function unlock(Request $request): JsonResponse
    {
        $data = $request->validate([
            'username' => ['required', 'string', 'max:120'],
            'pin' => ['required', 'string', 'min:4', 'max:12'],
            'terminal_code' => ['required', 'string', 'max:32'],
        ]);

        $throttleKey = 'pin:'.mb_strtolower($data['username']).'|'.$data['terminal_code'];

        if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
            throw ValidationException::withMessages([
                'pin' => ['محاولات كثيرة. حاول بعد '.RateLimiter::availableIn($throttleKey).' ثانية.'],
            ])->status(429);
        }

        $user = User::query()->where('username', $data['username'])->where('is_active', true)->first();

        if (! $user || ! $user->pin_hash || ! Hash::check($data['pin'], $user->pin_hash)) {
            RateLimiter::hit($throttleKey, 300);
            throw ValidationException::withMessages(['pin' => ['رمز الدخول غير صحيح.']]);
        }

        RateLimiter::clear($throttleKey);
        $terminal = Terminal::query()->where('code', $data['terminal_code'])->first();
        $token = $user->createToken('pin:'.$data['terminal_code'], ['*']);

        $this->audit->log('auth.unlock', $user, null, ['terminal' => $data['terminal_code']]);

        return response()->json([
            'token' => $token->plainTextToken,
            'user' => $this->userPayload($user, $terminal),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $terminal = $request->attributes->get('pos.terminal');

        return response()->json(['user' => $this->userPayload($request->user(), $terminal)]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()?->currentAccessToken()?->delete();

        return response()->json(['message' => 'تم تسجيل الخروج.']);
    }

    /** @return array<string,mixed> */
    private function userPayload(User $user, ?Terminal $terminal): array
    {
        $branchId = $terminal?->branch_id ?? $user->default_branch_id;

        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'locale' => $user->locale,
            'branch_id' => $branchId,
            'terminal' => $terminal ? [
                'id' => $terminal->id,
                'code' => $terminal->code,
                'name' => $terminal->name,
                'warehouse_id' => $terminal->warehouse_id,
                'offline_allowed' => (bool) $terminal->offline_allowed,
            ] : null,
            'roles' => $user->roles->pluck('code')->all(),
            'permissions' => $this->permissions->permissionsFor($user, $branchId),
            'limits' => [
                'max_discount_percent' => $user->limits?->max_discount_percent ?? '0',
                'max_discount_amount' => $user->limits?->max_discount_amount ?? '0',
            ],
            'features' => $this->settings->features($branchId),
        ];
    }
}
