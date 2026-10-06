import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { passwordFingerprint } from '@/lib/auth/fingerprint';
import { SESSION_COOKIE_NAME, signSessionToken } from '@/lib/auth/session';
import { proxy } from '@/proxy';

const SECRET = 'test-secret-that-is-long-enough-for-hs256-0123456789';
const ORIGIN = 'https://docs.useathos.ai';
const ORGS = { acme: 'acme-pass-1', globex: 'globex-pass-2' };

function gateOn(orgs: Record<string, string> = ORGS) {
  vi.stubEnv('DOCS_PASSWORDS', JSON.stringify(orgs));
  vi.stubEnv('DOCS_AUTH_SECRET', SECRET);
  vi.stubEnv('NODE_ENV', 'production');
}

async function sessionFor(org: keyof typeof ORGS, password = ORGS[org], secret = SECRET) {
  return signSessionToken(secret, { org, fp: await passwordFingerprint(password, secret) });
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

  it('lets a request with a valid session for a configured org through', async () => {
    gateOn();
    const res = await proxy(request('/sdk/quickstart', await sessionFor('globex')));
    expect(passedThrough(res)).toBe(true);
  });

  it('redirects when the cookie was signed with a different secret', async () => {
    gateOn();
    const token = await sessionFor('acme', ORGS.acme, 'another-secret-that-is-also-long-enough-0123456789');
    expect((await proxy(request('/sdk/quickstart', token))).status).toBe(307);
  });

  it('logs an org out once it is removed from the map', async () => {
    gateOn();
    const token = await sessionFor('globex');
    gateOn({ acme: ORGS.acme });
    expect((await proxy(request('/sdk/quickstart', token))).status).toBe(307);
  });

  it("logs an org out once its password is rotated, without touching other orgs", async () => {
    gateOn();
    const globex = await sessionFor('globex');
    const acme = await sessionFor('acme');
    gateOn({ ...ORGS, globex: 'globex-new-pass' });
    expect((await proxy(request('/sdk/quickstart', globex))).status).toBe(307);
    expect(passedThrough(await proxy(request('/sdk/quickstart', acme)))).toBe(true);
  });

  it('lets the login page through without a cookie', async () => {
    gateOn();
    expect(passedThrough(await proxy(request('/login')))).toBe(true);
    expect(passedThrough(await proxy(request('/api/auth/login')))).toBe(true);
  });

  it('gates OG images', async () => {
    gateOn();
    expect((await proxy(request('/og/docs/sdk/quickstart/image.png'))).status).toBe(307);
  });

  it('fails closed with 503 in production when the gate is misconfigured', async () => {
    vi.stubEnv('DOCS_PASSWORDS', '');
    vi.stubEnv('DOCS_AUTH_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect((await proxy(request('/'))).status).toBe(503);
  });

  it('runs open in development when no passwords are set', async () => {
    vi.stubEnv('DOCS_PASSWORDS', '');
    vi.stubEnv('DOCS_AUTH_SECRET', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(passedThrough(await proxy(request('/')))).toBe(true);
  });
});
