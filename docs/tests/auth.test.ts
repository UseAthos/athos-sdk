import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { passwordFingerprint } from '@/lib/auth/fingerprint';
import { resolveGate } from '@/lib/auth/gate';
import { findOrgForPassword, verifyPassword } from '@/lib/auth/password';
import { isPublicPath } from '@/lib/auth/public-paths';
import { signSessionToken, verifySessionToken } from '@/lib/auth/session';

const SECRET = 'test-secret-that-is-long-enough-for-hs256-0123456789';
const OTHER_SECRET = 'some-other-secret-0123456789abcdefghijklmnop';
const ORGS = { acme: 'acme-pass-1', globex: 'globex-pass-2' };

describe('verifyPassword', () => {
  it('accepts the exact configured password', () => {
    expect(verifyPassword('hunter2', 'hunter2', SECRET)).toBe(true);
  });

  it('rejects a wrong password of the same length', () => {
    expect(verifyPassword('hunter3', 'hunter2', SECRET)).toBe(false);
  });

  it('rejects a wrong password of a different length', () => {
    expect(verifyPassword('hunter22', 'hunter2', SECRET)).toBe(false);
  });

  it('rejects an empty password', () => {
    expect(verifyPassword('', 'hunter2', SECRET)).toBe(false);
  });
});

describe('findOrgForPassword', () => {
  it('returns the org whose password matches', () => {
    expect(findOrgForPassword('globex-pass-2', ORGS, SECRET)).toBe('globex');
    expect(findOrgForPassword('acme-pass-1', ORGS, SECRET)).toBe('acme');
  });

  it('returns null when no org matches', () => {
    expect(findOrgForPassword('nope', ORGS, SECRET)).toBeNull();
  });

  it('returns null for an empty password even if an org list is present', () => {
    expect(findOrgForPassword('', ORGS, SECRET)).toBeNull();
  });
});

describe('passwordFingerprint', () => {
  it('is stable for the same password and secret', async () => {
    expect(await passwordFingerprint('pw', SECRET)).toBe(await passwordFingerprint('pw', SECRET));
  });

  it('is a short hex string, not the password', async () => {
    const fp = await passwordFingerprint('pw', SECRET);
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  it('changes when the password changes', async () => {
    expect(await passwordFingerprint('pw1', SECRET)).not.toBe(await passwordFingerprint('pw2', SECRET));
  });

  it('changes when the secret changes', async () => {
    expect(await passwordFingerprint('pw', SECRET)).not.toBe(await passwordFingerprint('pw', OTHER_SECRET));
  });
});

describe('session tokens', () => {
  const claims = { org: 'acme', fp: '0123456789abcdef' };

  it('returns the org and fingerprint from a token it just signed', async () => {
    const token = await signSessionToken(SECRET, claims);
    expect(await verifySessionToken(token, SECRET)).toEqual(claims);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signSessionToken(OTHER_SECRET, claims);
    expect(await verifySessionToken(token, SECRET)).toBeNull();
  });

  it('rejects a tampered token', async () => {
    const token = await signSessionToken(SECRET, claims);
    const [header, payload, sig] = token.split('.');
    const tampered = `${header}.${payload}${payload.endsWith('A') ? 'B' : 'A'}.${sig}`;
    expect(await verifySessionToken(tampered, SECRET)).toBeNull();
  });

  it('rejects a missing token', async () => {
    expect(await verifySessionToken(undefined, SECRET)).toBeNull();
    expect(await verifySessionToken('', SECRET)).toBeNull();
  });

  it('rejects a validly signed token that lacks the org claims', async () => {
    const legacy = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifySessionToken(legacy, SECRET)).toBeNull();
  });
});

describe('isPublicPath', () => {
  it.each(['/login', '/api/auth/login', '/_next/static/chunks/main.js', '/favicon.ico'])(
    'leaves %s open',
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    },
  );

  it.each([
    '/',
    '/sdk/quickstart',
    '/api/search',
    '/llms.txt',
    '/llms-full.txt',
    '/openapi.yaml',
    '/loginx',
    // OG images render page titles; an image-suffix rule must not exempt them.
    '/og/docs/sdk/quickstart/image.png',
    '/sdk/quickstart.png',
  ])('gates %s', (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});

describe('resolveGate', () => {
  const prod = { DOCS_AUTH_SECRET: SECRET, NODE_ENV: 'production' };

  it('is on with the parsed org map when passwords and secret are set', () => {
    expect(resolveGate({ ...prod, DOCS_PASSWORDS: JSON.stringify(ORGS) })).toEqual({
      mode: 'on',
      orgs: ORGS,
      secret: SECRET,
    });
  });

  it('is off in development when no passwords are set', () => {
    expect(resolveGate({ NODE_ENV: 'development' })).toEqual({ mode: 'off' });
  });

  it('is misconfigured in production when no passwords are set', () => {
    expect(resolveGate({ NODE_ENV: 'production' })).toMatchObject({ mode: 'misconfigured' });
  });

  it('is misconfigured when passwords are set without a secret', () => {
    expect(resolveGate({ DOCS_PASSWORDS: JSON.stringify(ORGS), NODE_ENV: 'development' })).toMatchObject({
      mode: 'misconfigured',
    });
  });

  it('is misconfigured when the secret is shorter than 32 characters', () => {
    expect(
      resolveGate({ DOCS_PASSWORDS: JSON.stringify(ORGS), DOCS_AUTH_SECRET: 'short', NODE_ENV: 'production' }),
    ).toMatchObject({ mode: 'misconfigured' });
  });

  it.each([
    ['invalid JSON', 'not json'],
    ['a JSON array', '["a","b"]'],
    ['an empty object', '{}'],
    ['a non-string password', '{"acme": 123}'],
    ['an empty password', '{"acme": ""}'],
    ['an empty org name', '{"": "pw"}'],
  ])('is misconfigured when DOCS_PASSWORDS is %s', (_label, value) => {
    expect(resolveGate({ ...prod, DOCS_PASSWORDS: value })).toMatchObject({ mode: 'misconfigured' });
  });

  it('is misconfigured when two orgs share a password, so a match is always unambiguous', () => {
    expect(resolveGate({ ...prod, DOCS_PASSWORDS: '{"acme":"same","globex":"same"}' })).toMatchObject({
      mode: 'misconfigured',
    });
  });

  it('explains why it is misconfigured, for the server log', () => {
    const gate = resolveGate({ ...prod, DOCS_PASSWORDS: 'not json' });
    expect(gate.mode).toBe('misconfigured');
    if (gate.mode === 'misconfigured') expect(gate.reason).toMatch(/DOCS_PASSWORDS/);
  });
});
