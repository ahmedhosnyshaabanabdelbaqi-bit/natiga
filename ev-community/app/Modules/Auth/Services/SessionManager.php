<?php

namespace App\Modules\Auth\Services;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Session;

/**
 * Session listing/invalidation for the database session driver.
 */
class SessionManager
{
    /** @return array<int, array{id: string, ip_address: ?string, user_agent: ?string, last_activity: string, is_current: bool}> */
    public function activeSessions(User $user): array
    {
        if (config('session.driver') !== 'database') {
            return [];
        }
        $current = Session::getId();

        return DB::table('sessions')->where('user_id', $user->id)->orderByDesc('last_activity')->get()
            ->map(fn ($row) => [
                'id' => $row->id,
                'ip_address' => $row->ip_address,
                'user_agent' => $row->user_agent,
                'device' => $this->describeAgent((string) $row->user_agent),
                'last_activity' => Carbon::createFromTimestamp($row->last_activity)->toIso8601String(),
                'is_current' => $row->id === $current,
            ])->values()->all();
    }

    public function logoutOtherDevices(User $user): int
    {
        if (config('session.driver') !== 'database') {
            return 0;
        }

        return DB::table('sessions')->where('user_id', $user->id)->where('id', '!=', Session::getId())->delete();
    }

    public function logoutAll(User $user): int
    {
        if (config('session.driver') !== 'database') {
            return 0;
        }

        return DB::table('sessions')->where('user_id', $user->id)->delete();
    }

    private function describeAgent(string $agent): string
    {
        $browser = match (true) {
            str_contains($agent, 'Edg/') => 'Edge',
            str_contains($agent, 'Chrome/') => 'Chrome',
            str_contains($agent, 'Safari/') && ! str_contains($agent, 'Chrome') => 'Safari',
            str_contains($agent, 'Firefox/') => 'Firefox',
            default => 'Browser',
        };
        $os = match (true) {
            str_contains($agent, 'iPhone') || str_contains($agent, 'iPad') => 'iOS',
            str_contains($agent, 'Android') => 'Android',
            str_contains($agent, 'Windows') => 'Windows',
            str_contains($agent, 'Mac OS') => 'macOS',
            str_contains($agent, 'Linux') => 'Linux',
            default => '',
        };

        return trim($browser.' '.$os);
    }
}
