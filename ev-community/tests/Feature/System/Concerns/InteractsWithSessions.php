<?php

namespace Tests\Feature\System\Concerns;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Database-backed session rows for session management tests (the test suite otherwise uses the array driver).
 */
trait InteractsWithSessions
{
    protected function useDatabaseSessions(): void
    {
        config(['session.driver' => 'database']);
    }

    /** Insert a session row for `$user` and return its (40-char, alphanumeric) id. */
    protected function makeSession(User $user, string $agent = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0', ?string $id = null): string
    {
        $id ??= Str::random(40);
        DB::table('sessions')->insert([
            'id' => $id,
            'user_id' => $user->id,
            'ip_address' => '10.0.0.'.random_int(1, 250),
            'user_agent' => $agent,
            'payload' => base64_encode(serialize([])),
            'last_activity' => now()->getTimestamp(),
        ]);

        return $id;
    }

    protected function sessionCount(User $user): int
    {
        return DB::table('sessions')->where('user_id', $user->id)->count();
    }
}
