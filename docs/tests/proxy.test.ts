import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE_NAME, signSessionToken } from '@/lib/auth/session';
import { proxy } from '@/proxy';

const SECRET = 'test-secret-that-is-long-enough-for-hs256-0123456789';
const ORIGIN = 'https://docs.useathos.ai';

function gateOn() {
  vi.stubEnv('DOCS_PASSWORD', 'pw');
  vi.stubEnv('DOCS_AUTH_SECRET', SECRET);
  vi.stubEnv('NODE_ENV', 'production');
}

function request(path: string, cookie?: string) {
  const headers = cookie ? { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } : undefined;
  return new NextRequest(`${ORIGIN}${path}`, { headers });
}

// NextResponse.next() marks the response with this header instead of a body.
function passedThrough(res: Response): boolean {
  return res.headers.get('x-middleware-next') === '1';
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('proxy', () => {
  it('redirects an unauthenticated page request to /login with an encoded return path', async () => {
    gateOn();
    const res = await proxy(request('/sdk/quickstart?tab=react'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?next=%2Fsdk%2Fquickstart%3Ftab%3Dreact`);
  });

  it('answers an unauthenticated API request with 401 JSON instead of a redirect', async () => {
    gateOn();
    const res = await proxy(request('/api/search?query=x'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('lets a request with a valid session cookie through', async () => {
    gateOn();
    const res = await proxy(request('/sdk/quickstart', await signSessionToken(SECRET)));
    expect(passedThrough(res)).toBe(true);
  });

  it('redirects when the cookie was signed with a different secret', async () => {
    gateOn();
    const token = await signSessionToken('another-secret-that-is-also-long-enough-0123456789');
    const res = await proxy(request('/sdk/quickstart', token));
    expect(res.status).toBe(307);
  });

  it('lets the login page through without a cookie', async () => {
    gateOn();
    expect(passedThrough(await proxy(request('/login')))).toBe(true);
    expect(passedThrough(await proxy(request('/api/auth/login')))).toBe(true);
  });

  it('gates OG images', async () => {
    gateOn();
    const res = await proxy(request('/og/docs/sdk/quickstart/image.png'));
    expect(res.status).toBe(307);
  });

  it('fails closed with 503 in production when the gate is misconfigured', async () => {
    vi.stubEnv('DOCS_PASSWORD', '');
    vi.stubEnv('DOCS_AUTH_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');
    const res = await proxy(request('/'));
    expect(res.status).toBe(503);
  });

  it('runs open in development when no password is set', async () => {
    vi.stubEnv('DOCS_PASSWORD', '');
    vi.stubEnv('DOCS_AUTH_SECRET', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(passedThrough(await proxy(request('/')))).toBe(true);
  });
});
