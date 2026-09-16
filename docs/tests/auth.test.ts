import { describe, expect, it } from 'vitest';
import { resolveGate } from '@/lib/auth/gate';
import { verifyPassword } from '@/lib/auth/password';
import { isPublicPath } from '@/lib/auth/public-paths';
import { signSessionToken, verifySessionToken } from '@/lib/auth/session';

const SECRET = 'test-secret-that-is-long-enough-for-hs256-0123456789';

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

describe('session tokens', () => {
  it('verifies a token it just signed', async () => {
    const token = await signSessionToken(SECRET);
    expect(await verifySessionToken(token, SECRET)).toBe(true);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signSessionToken('some-other-secret-0123456789abcdefghijklmnop');
    expect(await verifySessionToken(token, SECRET)).toBe(false);
  });

  it('rejects a tampered token', async () => {
    const token = await signSessionToken(SECRET);
    const [header, payload, sig] = token.split('.');
    const tampered = `${header}.${payload}${payload.endsWith('A') ? 'B' : 'A'}.${sig}`;
    expect(await verifySessionToken(tampered, SECRET)).toBe(false);
  });

  it('rejects a missing token', async () => {
    expect(await verifySessionToken(undefined, SECRET)).toBe(false);
    expect(await verifySessionToken('', SECRET)).toBe(false);
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
  it('is on when both password and secret are set', () => {
    expect(resolveGate({ DOCS_PASSWORD: 'pw', DOCS_AUTH_SECRET: SECRET, NODE_ENV: 'production' })).toEqual({
      mode: 'on',
      password: 'pw',
      secret: SECRET,
    });
  });

  it('is off in development when no password is set', () => {
    expect(resolveGate({ NODE_ENV: 'development' })).toEqual({ mode: 'off' });
  });

  it('is misconfigured in production when no password is set', () => {
    expect(resolveGate({ NODE_ENV: 'production' })).toEqual({ mode: 'misconfigured' });
  });

  it('is misconfigured when the password is set without a secret', () => {
    expect(resolveGate({ DOCS_PASSWORD: 'pw', NODE_ENV: 'development' })).toEqual({ mode: 'misconfigured' });
  });

  it('is misconfigured when the secret is shorter than 32 characters', () => {
    expect(resolveGate({ DOCS_PASSWORD: 'pw', DOCS_AUTH_SECRET: 'short', NODE_ENV: 'production' })).toEqual({
      mode: 'misconfigured',
    });
  });
});
