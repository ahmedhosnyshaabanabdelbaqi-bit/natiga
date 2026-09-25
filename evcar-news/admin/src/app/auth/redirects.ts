const AUTH_PAGES = ['/login', '/logout', '/forgot-password', '/reset-password', '/setup-password'];

/**
 * Only same-app absolute paths are allowed as post-login targets (prevents
 * open redirects such as `//evil.example` or `https://...`).
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  const path = next.split(/[?#]/)[0] ?? '/';
  if (AUTH_PAGES.includes(path)) return '/';
  return next;
}
