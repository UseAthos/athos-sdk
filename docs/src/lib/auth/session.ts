import { jwtVerify, SignJWT } from 'jose';

export const SESSION_COOKIE_NAME = 'athos-docs-auth';
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;

const ALGO = 'HS256';

/** What a session cookie asserts: which org signed in, and with which password (fingerprinted). */
export type SessionClaims = { org: string; fp: string };

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(secret: string, claims: SessionClaims): Promise<string> {
  return new SignJWT({ org: claims.org, fp: claims.fp })
    .setProtectedHeader({ alg: ALGO })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_S}s`)
    .sign(key(secret));
}

/** Returns the claims for a valid, unexpired token carrying both claims; otherwise null. */
export async function verifySessionToken(token: string | undefined, secret: string): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: [ALGO] });
    const { org, fp } = payload;
    if (typeof org !== 'string' || org.length === 0 || typeof fp !== 'string' || fp.length === 0) return null;
    return { org, fp };
  } catch {
    return null;
  }
}
