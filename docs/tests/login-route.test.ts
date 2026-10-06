import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/auth/login/route';
import { passwordFingerprint } from '@/lib/auth/fingerprint';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';

const SECRET = 'test-secret-that-is-long-enough-for-hs256-0123456789';
const ORGS = { acme: 'acme-pass-1', globex: 'globex-pass-2' };

function gateOn() {
  vi.stubEnv('DOCS_PASSWORDS', JSON.stringify(ORGS));
  vi.stubEnv('DOCS_AUTH_SECRET', SECRET);
  vi.stubEnv('NODE_ENV', 'production');
}

function post(body: unknown) {
  return POST(
    new Request('https://docs.useathos.ai/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

function cookieValue(res: Response): string | undefined {
  const header = res.headers.get('set-cookie') ?? '';
  return header.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))?.[1];
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/auth/login', () => {
  it('sets a session cookie naming the org whose password matched', async () => {
    gateOn();
    const res = await post({ password: ORGS.globex });
    expect(res.status).toBe(200);
    const claims = await verifySessionToken(cookieValue(res), SECRET);
    expect(claims).toEqual({ org: 'globex', fp: await passwordFingerprint(ORGS.globex, SECRET) });
  });

  it('sets the cookie httpOnly, secure, sameSite=lax, path=/', async () => {
    gateOn();
    const header = (await post({ password: ORGS.acme })).headers.get('set-cookie') ?? '';
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/SameSite=lax/i);
    expect(header).toMatch(/Path=\//);
  });

  it('rejects a wrong password with 401 and no cookie', async () => {
    gateOn();
    const res = await post({ password: 'nope' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Incorrect password' });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects a missing or non-string password with 400', async () => {
    gateOn();
    expect((await post({})).status).toBe(400);
    expect((await post({ password: 42 })).status).toBe(400);
    expect((await post({ password: '' })).status).toBe(400);
  });

  it('rejects an unparseable body with 400', async () => {
    gateOn();
    expect((await post('{not json')).status).toBe(400);
  });

  it('returns 503 when the gate is misconfigured', async () => {
    vi.stubEnv('DOCS_PASSWORDS', 'not json');
    vi.stubEnv('DOCS_AUTH_SECRET', SECRET);
    vi.stubEnv('NODE_ENV', 'production');
    expect((await post({ password: 'x' })).status).toBe(503);
  });
});
