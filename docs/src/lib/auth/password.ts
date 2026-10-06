import { createHmac, timingSafeEqual } from 'node:crypto';
import type { OrgPasswords } from './gate';

// HMAC both sides to a fixed-length digest before comparing: timingSafeEqual
// needs equal-length buffers, and the digest hides the password length, so the
// comparison leaks neither length nor content via timing.
function digest(value: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(value).digest();
}

export function verifyPassword(input: string, expected: string, secret: string): boolean {
  if (typeof input !== 'string' || input.length === 0) return false;
  return timingSafeEqual(digest(input, secret), digest(expected, secret));
}

// Check the input against every org without an early return, so the response
// time does not reveal which entry (if any) matched. `resolveGate` guarantees
// passwords are unique across orgs, so at most one can match.
export function findOrgForPassword(input: string, orgs: OrgPasswords, secret: string): string | null {
  let matched: string | null = null;
  for (const [org, password] of Object.entries(orgs)) {
    if (verifyPassword(input, password, secret)) matched = org;
  }
  return matched;
}
