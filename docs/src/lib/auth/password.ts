import { createHmac, timingSafeEqual } from 'node:crypto';

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
