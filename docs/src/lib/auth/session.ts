import { jwtVerify, SignJWT } from 'jose';

export const SESSION_COOKIE_NAME = 'athos-docs-auth';
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;

const ALGO = 'HS256';

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALGO })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_S}s`)
    .sign(key(secret));
}

export async function verifySessionToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, key(secret), { algorithms: [ALGO] });
    return true;
  } catch {
    return false;
  }
}
