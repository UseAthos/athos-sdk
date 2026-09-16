import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolveGate } from '@/lib/auth/gate';
import { isPublicPath } from '@/lib/auth/public-paths';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const gate = resolveGate();
  if (gate.mode === 'off') return NextResponse.next();
  if (gate.mode === 'misconfigured') {
    return new NextResponse('Docs password gate is not configured.', { status: 503 });
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (await verifySessionToken(token, gate.secret)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
