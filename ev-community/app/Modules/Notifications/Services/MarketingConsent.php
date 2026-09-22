<?php

namespace App\Modules\Notifications\Services;

use App\Models\User;
use App\Modules\Notifications\Models\Enums\NotificationChannel;
use Illuminate\Support\Facades\DB;

/**
 * Marketing consent per channel, backed by the core `consent_logs` table
 * (consent_type = marketing_email|marketing_sms|marketing_whatsapp). Append-only: the latest row wins.
 */
final class MarketingConsent
{
    public static function consentType(NotificationChannel|string $channel): string
    {
        $value = $channel instanceof NotificationChannel ? $channel->value : $channel;

        return 'marketing_'.$value;
    }

    public static function has(User $user, NotificationChannel|string $channel): bool
    {
        $latest = DB::table('consent_logs')
            ->where('user_id', $user->id)
            ->where('consent_type', self::consentType($channel))
            ->orderByDesc('id')
            ->first(['accepted_at', 'withdrawn_at']);

        return $latest !== null && $latest->accepted_at !== null && $latest->withdrawn_at === null;
    }

    public static function grant(User $user, NotificationChannel|string $channel, string $source = 'web'): void
    {
        if (self::has($user, $channel)) {
            return;
        }
        DB::table('consent_logs')->insert([
            'user_id' => $user->id,
            'consent_type' => self::consentType($channel),
            'version' => null,
            'accepted_at' => now(),
            'withdrawn_at' => null,
            'source' => $source,
            'ip_address' => app()->runningInConsole() ? null : request()?->ip(),
            'created_at' => now(),
        ]);
    }

    public static function withdraw(User $user, NotificationChannel|string $channel, string $source = 'web'): void
    {
        if (! self::has($user, $channel)) {
            return;
        }
        DB::table('consent_logs')->insert([
            'user_id' => $user->id,
            'consent_type' => self::consentType($channel),
            'version' => null,
            'accepted_at' => null,
            'withdrawn_at' => now(),
            'source' => $source,
            'ip_address' => app()->runningInConsole() ? null : request()?->ip(),
            'created_at' => now(),
        ]);
    }
}
