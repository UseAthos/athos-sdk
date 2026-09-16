import { describe, expect, it } from 'vitest';
import { safeNextPath } from '@/lib/auth/safe-next-path';

describe('safeNextPath', () => {
  it('keeps a relative in-site path with its query string', () => {
    expect(safeNextPath('/sdk/quickstart?tab=react')).toBe('/sdk/quickstart?tab=react');
  });

  it('falls back to the root when nothing is given', () => {
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath('')).toBe('/');
  });

  it.each(['https://evil.example', '//evil.example/x', '/\\evil.example', 'javascript:alert(1)', 'sdk/quickstart'])(
    'rejects %s and falls back to the root',
    (value) => {
      expect(safeNextPath(value)).toBe('/');
    },
  );

  it('does not bounce back to the login page itself', () => {
    expect(safeNextPath('/login')).toBe('/');
    expect(safeNextPath('/login?next=%2Fx')).toBe('/');
  });
});
