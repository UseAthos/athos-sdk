// Exact paths (and anything nested under them) that stay reachable without a
// session. Keep this list narrow and keyed on the resource, not the URL
// spelling: a broad prefix or a file-extension rule would silently make future
// routes public (the OG image route renders page titles as .png, for example).
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/favicon.ico'];

export function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith('/_next/')) return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
