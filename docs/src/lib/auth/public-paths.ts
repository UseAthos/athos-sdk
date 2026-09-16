// Exact paths (and anything nested under them) that stay reachable without a
// session. Keep this list narrow: a broad prefix would silently make any future
// route under it public.
const PUBLIC_PATHS = ['/login', '/api/auth/login'];

const STATIC_ASSET = /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/;

export function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith('/_next/')) return true;
  if (STATIC_ASSET.test(pathname)) return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
