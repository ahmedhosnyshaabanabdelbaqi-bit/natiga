<?php

namespace App\Support\Qr;

use App\Models\User;
use App\Support\Qr\Models\QrToken;
use Endroid\QrCode\Builder\Builder;
use Endroid\QrCode\ErrorCorrectionLevel;
use Endroid\QrCode\Writer\PngWriter;
use Endroid\QrCode\Writer\SvgWriter;
use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * Opaque, signed QR tokens + QR image rendering.
 *
 * A token never contains PII: the payload lives in `qr_tokens` and the string handed to the
 * client is base64url(token_id ‖ HMAC-SHA256(token_id|purpose, APP_KEY)).
 *
 *   $token = $qr->token('membership_card', ['membership_id' => $m->id], ttlSeconds: 600);
 *   $payload = $qr->verify($token, 'membership_card');          // null when invalid/expired/used/revoked
 *   $qr->revoke($token, 'membership_card');                     // e.g. card reissued
 *   $svg = $qr->svg(route('shared.qr.verify', ['token' => $token]));
 */
final class QrService
{
    private const TOKEN_ID_LENGTH = 26;

    private const SIGNATURE_BYTES = 32;

    /** Purge used single-use tokens after this many days (kept briefly for support/audit questions). */
    private const USED_RETENTION_DAYS = 30;

    // ------------------------------------------------------------------ tokens

    /**
     * @param  array<string, mixed>  $payload  stored server-side only
     * @param  int|null  $ttlSeconds  null = never expires (use only for printed material)
     */
    public function token(string $purpose, array $payload, ?int $ttlSeconds = null, bool $singleUse = false): string
    {
        $this->assertPurpose($purpose);
        if ($ttlSeconds !== null && $ttlSeconds < 1) {
            throw new InvalidArgumentException('ttlSeconds must be positive');
        }

        $tokenId = strtolower((string) Str::ulid());

        QrToken::query()->create([
            'token_id' => $tokenId,
            'purpose' => $purpose,
            'payload' => $payload,
            'expires_at' => $ttlSeconds === null ? null : now()->addSeconds($ttlSeconds),
            'single_use' => $singleUse,
            'created_at' => now(),
        ]);

        return $this->encode($tokenId.$this->sign($tokenId, $purpose));
    }

    /**
     * Returns the payload, or null when the token is malformed, tampered, of another purpose,
     * expired or (for single-use tokens) already used. Single-use tokens are consumed atomically.
     *
     * @return array<string, mixed>|null
     */
    public function verify(string $token, string $purpose, ?User $user = null): ?array
    {
        $this->assertPurpose($purpose);

        $tokenId = $this->tokenIdFrom($token, $purpose);
        if ($tokenId === null) {
            return null;
        }

        $row = QrToken::query()->where('token_id', $tokenId)->where('purpose', $purpose)->first();
        // used_at is set when a single-use token was consumed or any token was revoked.
        if ($row === null || $row->isExpired() || $row->used_at !== null) {
            return null;
        }

        if ($row->single_use) {
            // Atomic consume: of two concurrent scans exactly one gets the payload.
            $claimed = QrToken::query()->whereKey($row->id)->whereNull('used_at')
                ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
                ->update(['used_at' => now(), 'used_by' => $user?->id]);
            if ($claimed !== 1) {
                return null;
            }
        }

        return $row->payload;
    }

    /**
     * Inspect a token without consuming it (for "show what this QR is" screens). Same checks as verify().
     *
     * @return array<string, mixed>|null
     */
    public function peek(string $token, string $purpose): ?array
    {
        $this->assertPurpose($purpose);
        $tokenId = $this->tokenIdFrom($token, $purpose);
        if ($tokenId === null) {
            return null;
        }
        $row = QrToken::query()->where('token_id', $tokenId)->where('purpose', $purpose)->first();

        return $row === null || $row->isExpired() || $row->used_at !== null ? null : $row->payload;
    }

    /** Invalidate a token before its expiry (e.g. card reissued). Only correctly signed tokens can be revoked. */
    public function revoke(string $token, string $purpose): bool
    {
        $this->assertPurpose($purpose);
        $tokenId = $this->tokenIdFrom($token, $purpose);
        if ($tokenId === null) {
            return false;
        }

        return QrToken::query()->where('token_id', $tokenId)->where('purpose', $purpose)->whereNull('used_at')->update(['used_at' => now()]) === 1;
    }

    public function purgeExpired(): int
    {
        $deleted = QrToken::query()->expired()->delete();
        $deleted += QrToken::query()->whereNotNull('used_at')->where('used_at', '<', now()->subDays(self::USED_RETENTION_DAYS))->delete();

        return $deleted;
    }

    // ------------------------------------------------------------------ images

    public function svg(string $content, int $size = 240): string
    {
        $this->assertContent($content);

        return (new Builder(
            writer: new SvgWriter,
            writerOptions: [SvgWriter::WRITER_OPTION_EXCLUDE_XML_DECLARATION => true],
            data: $content,
            errorCorrectionLevel: ErrorCorrectionLevel::Medium,
            size: max(64, $size),
            margin: 8,
        ))->build()->getString();
    }

    /** SVG without width/height/XML declaration, suitable for embedding inside another SVG. */
    public function svgFragment(string $content, int $size = 240): string
    {
        $this->assertContent($content);

        return (new Builder(
            writer: new SvgWriter,
            writerOptions: [
                SvgWriter::WRITER_OPTION_EXCLUDE_XML_DECLARATION => true,
                SvgWriter::WRITER_OPTION_EXCLUDE_SVG_WIDTH_AND_HEIGHT => true,
            ],
            data: $content,
            errorCorrectionLevel: ErrorCorrectionLevel::Medium,
            size: max(64, $size),
            margin: 4,
        ))->build()->getString();
    }

    public function png(string $content, int $size = 240): string
    {
        $this->assertContent($content);

        return (new Builder(
            writer: new PngWriter,
            data: $content,
            errorCorrectionLevel: ErrorCorrectionLevel::Medium,
            size: max(64, $size),
            margin: 8,
        ))->build()->getString();
    }

    public function pngDataUri(string $content, int $size = 240): string
    {
        return 'data:image/png;base64,'.base64_encode($this->png($content, $size));
    }

    // --------------------------------------------------------------- internals

    /** Token id when the token is well-formed and its signature matches the purpose, otherwise null. */
    private function tokenIdFrom(string $token, string $purpose): ?string
    {
        $raw = $this->decode($token);
        if ($raw === null || strlen($raw) !== self::TOKEN_ID_LENGTH + self::SIGNATURE_BYTES) {
            return null;
        }
        $tokenId = substr($raw, 0, self::TOKEN_ID_LENGTH);
        $signature = substr($raw, self::TOKEN_ID_LENGTH);
        if (! preg_match('/^[0-9a-z]{26}$/', $tokenId) || ! hash_equals($this->sign($tokenId, $purpose), $signature)) {
            return null;
        }

        return $tokenId;
    }

    private function sign(string $tokenId, string $purpose): string
    {
        return hash_hmac('sha256', $tokenId.'|'.$purpose, $this->key(), true);
    }

    private function key(): string
    {
        $key = (string) config('app.key');
        if (str_starts_with($key, 'base64:')) {
            $key = base64_decode(substr($key, 7), true) ?: $key;
        }
        if ($key === '') {
            throw new \RuntimeException('APP_KEY is not set; QR tokens cannot be signed.');
        }

        return $key;
    }

    private function encode(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    private function decode(string $token): ?string
    {
        if ($token === '' || strlen($token) > 128 || ! preg_match('/^[A-Za-z0-9\-_]+$/', $token)) {
            return null;
        }
        $decoded = base64_decode(strtr($token, '-_', '+/').str_repeat('=', (4 - strlen($token) % 4) % 4), true);

        return $decoded === false ? null : $decoded;
    }

    private function assertPurpose(string $purpose): void
    {
        if (! preg_match('/^[a-z0-9_\-.]{1,60}$/', $purpose)) {
            throw new InvalidArgumentException("Invalid QR purpose [{$purpose}]");
        }
    }

    private function assertContent(string $content): void
    {
        if ($content === '' || strlen($content) > 2000) {
            throw new InvalidArgumentException('QR content must be between 1 and 2000 bytes.');
        }
    }
}
