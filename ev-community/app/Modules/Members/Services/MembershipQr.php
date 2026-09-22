<?php

namespace App\Modules\Members\Services;

use App\Modules\Members\Models\Membership;
use App\Modules\System\Services\Settings;
use Endroid\QrCode\Builder\Builder;
use Endroid\QrCode\ErrorCorrectionLevel;
use Endroid\QrCode\RoundBlockSizeMode;
use Endroid\QrCode\Writer\SvgWriter;

/**
 * Short-lived, signed membership QR tokens.
 *
 *   token  = base64url("{public_id}.{expires}.{hmac}")
 *   hmac   = HMAC-SHA256(app key, "{verification_token}|{expires}")
 *
 * The token carries no personal data (the public id is an opaque ULID). Because the HMAC covers
 * the membership's private `verification_token`, rotating that column invalidates every token
 * issued before. Verification is server-side only and uses constant-time comparison.
 */
final class MembershipQr
{
    public const REASON_INVALID = 'invalid';

    public const REASON_EXPIRED = 'expired';

    public const REASON_NOT_ACTIVE = 'not_active';

    public function ttlMinutes(): int
    {
        return max(1, Settings::int('members.qr_token_ttl_minutes', 10));
    }

    /** Seconds after which the card page should fetch a fresh token (~ttl − 1 minute, never below 30s). */
    public function refreshSeconds(): int
    {
        return max(30, ($this->ttlMinutes() - 1) * 60);
    }

    public function token(Membership $membership, ?int $expiresAt = null): string
    {
        $expires = $expiresAt ?? now()->addMinutes($this->ttlMinutes())->getTimestamp();
        $signature = $this->signature($membership->verification_token, $expires);

        return $this->base64UrlEncode("{$membership->public_id}.{$expires}.{$signature}");
    }

    public function expiresAt(string $token): ?int
    {
        $parts = $this->parts($token);

        return $parts ? (int) $parts[1] : null;
    }

    /**
     * Order of checks: structure → signature (constant time) → expiry → membership/account state.
     * `membership` is returned for every outcome whose token resolved to a membership (so the attempt
     * can be logged against it), but callers must only disclose member data when `authentic` is true.
     *
     * @return array{valid: bool, authentic: bool, reason?: string, membership?: Membership}
     */
    public function verify(string $token): array
    {
        $parts = $this->parts($token);
        if ($parts === null) {
            return ['valid' => false, 'authentic' => false, 'reason' => self::REASON_INVALID];
        }
        [$publicId, $expires, $signature] = $parts;

        $membership = Membership::query()->with('user')->where('public_id', $publicId)->first();
        if (! $membership) {
            return ['valid' => false, 'authentic' => false, 'reason' => self::REASON_INVALID];
        }

        $expected = $this->signature($membership->verification_token, (int) $expires);
        if (! hash_equals($expected, $signature)) {
            return ['valid' => false, 'authentic' => false, 'reason' => self::REASON_INVALID, 'membership' => $membership];
        }
        if ((int) $expires < now()->getTimestamp()) {
            return ['valid' => false, 'authentic' => true, 'reason' => self::REASON_EXPIRED, 'membership' => $membership];
        }
        // A disabled account (self-deactivated, anonymised or blocked by staff) never verifies,
        // even when the membership row itself is still active.
        if (! $membership->isActive() || ! $membership->user?->isActive()) {
            return ['valid' => false, 'authentic' => true, 'reason' => self::REASON_NOT_ACTIVE, 'membership' => $membership];
        }

        return ['valid' => true, 'authentic' => true, 'membership' => $membership];
    }

    /** Absolute public verification URL embedded in the QR image. */
    public function verifyUrl(string $token): string
    {
        return route('shared.members.verify', ['token' => $token]);
    }

    /** Accepts the raw scanner payload (full verify URL or bare token) and returns the token part. */
    public function tokenFromScan(string $raw): string
    {
        $raw = trim($raw);
        if (preg_match('~/verify/([A-Za-z0-9_-]+)~', $raw, $m)) {
            return $m[1];
        }

        return $raw;
    }

    /** QR image as an inline SVG string (no XML declaration, scales with its container). */
    public function svg(string $data, int $size = 256): string
    {
        $builder = new Builder(
            writer: new SvgWriter,
            writerOptions: [SvgWriter::WRITER_OPTION_EXCLUDE_XML_DECLARATION => true, SvgWriter::WRITER_OPTION_EXCLUDE_SVG_WIDTH_AND_HEIGHT => true],
            data: $data,
            errorCorrectionLevel: ErrorCorrectionLevel::Medium,
            size: $size,
            margin: 8,
            roundBlockSizeMode: RoundBlockSizeMode::Margin,
        );

        return $builder->build()->getString();
    }

    /** @return array{0: string, 1: string, 2: string}|null */
    private function parts(string $token): ?array
    {
        $decoded = $this->base64UrlDecode(trim($token));
        if ($decoded === null || substr_count($decoded, '.') !== 2) {
            return null;
        }
        [$publicId, $expires, $signature] = explode('.', $decoded);
        if (! preg_match('/^[0-9A-Za-z]{26}$/', $publicId) || ! ctype_digit($expires) || strlen($expires) > 12 || ! preg_match('/^[a-f0-9]{64}$/', $signature)) {
            return null;
        }

        return [$publicId, $expires, $signature];
    }

    private function signature(string $verificationToken, int $expires): string
    {
        return hash_hmac('sha256', $verificationToken.'|'.$expires, $this->key());
    }

    private function key(): string
    {
        $key = (string) config('app.key');
        if (str_starts_with($key, 'base64:')) {
            $decoded = base64_decode(substr($key, 7), true);
            if ($decoded !== false) {
                return $decoded;
            }
        }

        return $key;
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $value): ?string
    {
        if ($value === '' || strlen($value) > 512 || ! preg_match('/^[A-Za-z0-9_-]+$/', $value)) {
            return null;
        }
        $decoded = base64_decode(strtr($value, '-_', '+/').str_repeat('=', (4 - strlen($value) % 4) % 4), true);

        return $decoded === false ? null : $decoded;
    }
}
