<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Vite;
use Symfony\Component\HttpFoundation\Response;

/**
 * Security headers. CSP uses a per-request nonce (Vite::useCspNonce) so inline bootstrap scripts
 * in the root template stay allowed while arbitrary injected scripts are blocked.
 * Camera and geolocation are allowed for the QR scanner and "near me" search (self only).
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $nonce = Vite::useCspNonce();
        $response = $next($request);

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), interest-cohort=()');
        $response->headers->set('Cross-Origin-Opener-Policy', 'same-origin');

        if ($request->isSecure() || app()->isProduction()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        if (config('ev.security.csp_enabled', app()->isProduction())) {
            $tileHosts = $this->tileHosts();
            $csp = implode('; ', array_filter([
                "default-src 'self'",
                "base-uri 'self'",
                "object-src 'none'",
                "frame-ancestors 'none'",
                "form-action 'self'",
                "script-src 'self' 'nonce-{$nonce}'",
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                "font-src 'self' data: https://fonts.gstatic.com",
                "img-src 'self' data: blob: https: ".$tileHosts,
                "connect-src 'self' ".$tileHosts.' '.$this->extraConnect(),
                "media-src 'self' blob:",
                "worker-src 'self' blob:",
                "manifest-src 'self'",
                app()->isProduction() ? 'upgrade-insecure-requests' : null,
            ]));
            $response->headers->set('Content-Security-Policy', $csp);
        }

        return $response;
    }

    private function tileHosts(): string
    {
        $tile = (string) config('ev.map.tile_url', '');
        $host = parse_url(str_replace('{s}.', '', $tile), PHP_URL_HOST);
        if (! $host) {
            return '';
        }
        // allow subdomain tile servers (a/b/c.tile.openstreetmap.org)
        return 'https://'.$host.' https://*.'.$host;
    }

    private function extraConnect(): string
    {
        $hosts = array_filter(array_map('trim', explode(',', (string) config('ev.security.csp_connect_hosts', ''))));

        return implode(' ', $hosts);
    }
}
