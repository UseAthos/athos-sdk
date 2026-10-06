import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { passwordFingerprint } from '@/lib/auth/fingerprint';
import { type Gate, resolveGate } from '@/lib/auth/gate';
import { isPublicPath } from '@/lib/auth/public-paths';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const gate = resolveGate();
  if (gate.mode === 'off') return NextResponse.next();
  if (gate.mode === 'misconfigured') {
    console.error(`[docs-auth] gate misconfigured: ${gate.reason}`);
    return new NextResponse('Docs password gate is not configured.', { status: 503 });
  }

  if (await hasCurrentSession(req, gate)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

// A session is only good while its org is still configured with the same
// password it signed in with. Removing an org or rotating its password logs
// that org out on the next request, without touching other orgs' sessions.
async function hasCurrentSession(req: NextRequest, gate: Extract<Gate, { mode: 'on' }>): Promise<boolean> {
  const claims = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value, gate.secret);
  if (!claims) return false;
  const password = gate.orgs[claims.org];
  if (!password) return false;
  return (await passwordFingerprint(password, gate.secret)) === claims.fp;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
