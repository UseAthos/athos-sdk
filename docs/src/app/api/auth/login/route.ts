import { NextResponse } from 'next/server';
import { passwordFingerprint } from '@/lib/auth/fingerprint';
import { resolveGate } from '@/lib/auth/gate';
import { findOrgForPassword } from '@/lib/auth/password';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_S, signSessionToken } from '@/lib/auth/session';

export async function POST(req: Request) {
  const gate = resolveGate();
  if (gate.mode !== 'on') {
    if (gate.mode === 'misconfigured') console.error(`[docs-auth] gate misconfigured: ${gate.reason}`);
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

  const org = findOrgForPassword(password, gate.orgs, gate.secret);
  if (!org) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  console.info(`[docs-auth] sign-in org=${org}`);

  const token = await signSessionToken(gate.secret, {
    org,
    fp: await passwordFingerprint(gate.orgs[org], gate.secret),
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
