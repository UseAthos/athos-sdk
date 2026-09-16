// Only allow same-origin, absolute-path redirects after sign-in. Anything that
// could be read as a scheme or a protocol-relative URL falls back to the root,
// as does the login page itself (to avoid a redirect loop).
export function safeNextPath(value: string | null): string {
  if (!value) return '/';
  if (!value.startsWith('/')) return '/';
  if (value.startsWith('//') || value.startsWith('/\\')) return '/';
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/login/')) return '/';
  return value;
}
