<?php

namespace App\Modules\Notifications\Services;

use App\Models\User;
use App\Modules\Notifications\Models\Enums\NotificationChannel;
use Illuminate\Support\Facades\DB;

/**
 * Per-channel consent, backed by the core append-only `consent_logs` table
 * (consent_type = marketing_email|marketing_sms|marketing_whatsapp; the latest row per type wins).
 * The Members privacy page writes the same rows, so both screens always agree.
 *
 * Rules (see docs/modules/notifications.md): SMS/WhatsApp deliveries always need the channel consent;
 * email needs it only for non-transactional (marketing) notifications.
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

    /**
     * Current consent for every provider channel in one query.
     *
     * @return array<string, bool> channel value => granted
     */
    public static function states(User $user): array
    {
        $types = [];
        foreach (NotificationChannel::cases() as $channel) {
            if ($channel->requiresProvider()) {
                $types[self::consentType($channel)] = $channel->value;
            }
        }
        $rows = DB::table('consent_logs')->where('user_id', $user->id)->whereIn('consent_type', array_keys($types))
            ->orderByDesc('id')->get(['consent_type', 'accepted_at', 'withdrawn_at']);

        $states = array_fill_keys(array_values($types), false);
        $seen = [];
        foreach ($rows as $row) {
            if (isset($seen[$row->consent_type])) {
                continue;
            }
            $seen[$row->consent_type] = true;
            $states[$types[$row->consent_type]] = $row->accepted_at !== null && $row->withdrawn_at === null;
        }

        return $states;
    }

    /** Records consent (no-op when already granted). Returns true when a row was written. */
    public static function grant(User $user, NotificationChannel|string $channel, string $source = 'web'): bool
    {
        if (self::has($user, $channel)) {
            return false;
        }
        self::write($user, $channel, true, $source);

        return true;
    }

    /** Records a withdrawal (no-op when not granted). Returns true when a row was written. */
    public static function withdraw(User $user, NotificationChannel|string $channel, string $source = 'web'): bool
    {
        if (! self::has($user, $channel)) {
            return false;
        }
        self::write($user, $channel, false, $source);

        return true;
    }

    private static function write(User $user, NotificationChannel|string $channel, bool $granted, string $source): void
    {
        DB::table('consent_logs')->insert([
            'user_id' => $user->id,
            'consent_type' => self::consentType($channel),
            'version' => null,
            'accepted_at' => $granted ? now() : null,
            'withdrawn_at' => $granted ? null : now(),
            'source' => mb_substr($source, 0, 40),
            'ip_address' => app()->runningInConsole() ? null : request()?->ip(),
            'created_at' => now(),
        ]);
    }
}
