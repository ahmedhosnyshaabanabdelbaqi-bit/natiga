<?php

namespace App\Modules\System\Services;

use App\Models\User;
use App\Modules\Auth\Services\SessionManager;
use Illuminate\Support\Facades\DB;

/**
 * Raw session ids are bearer secrets and must never reach the browser. Session lists expose an opaque key
 * (HMAC of the id with the app key); revocation resolves the key back to a session of *that* user only.
 */
final class SessionKeys
{
    public function __construct(private readonly SessionManager $sessions) {}

    public static function keyFor(string $sessionId): string
    {
        return substr(hash_hmac('sha256', $sessionId, (string) config('app.key')), 0, 40);
    }

    /**
     * Active sessions of a user with the raw id replaced by its opaque key.
     *
     * @return array<int, array{id: string, ip_address: ?string, user_agent: ?string, device: string, last_activity: string, is_current: bool}>
     */
    public function forUser(User $user): array
    {
        return array_map(function (array $session): array {
            $session['id'] = self::keyFor($session['id']);

            return $session;
        }, $this->sessions->activeSessions($user));
    }

    /** The raw session id of `$user` matching `$key`, or null (unknown key or another user's session). */
    public function resolve(User $user, string $key): ?string
    {
        if (config('session.driver') !== 'database' || ! preg_match('/^[a-f0-9]{40}$/', $key)) {
            return null;
        }
        foreach (DB::table('sessions')->where('user_id', $user->id)->pluck('id') as $id) {
            if (hash_equals(self::keyFor((string) $id), $key)) {
                return (string) $id;
            }
        }

        return null;
    }

    /** Delete one session of `$user` by opaque key. Returns true when a row was deleted. */
    public function revoke(User $user, string $key): bool
    {
        $id = $this->resolve($user, $key);

        return $id !== null && DB::table('sessions')->where('user_id', $user->id)->where('id', $id)->delete() > 0;
    }
}
