import { NextResponse } from 'next/server';
import { resolveGate } from '@/lib/auth/gate';
import { verifyPassword } from '@/lib/auth/password';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_S, signSessionToken } from '@/lib/auth/session';

export async function POST(req: Request) {
  const gate = resolveGate();
  if (gate.mode !== 'on') {
    return NextResponse.json({ error: 'Password gate is not configured' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const password =
    typeof body === 'object' && body !== null && 'password' in body ? (body as { password: unknown }).password : undefined;
  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 });
  }

  if (!verifyPassword(password, gate.password, gate.secret)) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, await signSessionToken(gate.secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
