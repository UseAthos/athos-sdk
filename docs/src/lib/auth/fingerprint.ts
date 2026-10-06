// A short, keyed fingerprint of an org's password that rides in the session
// cookie. The proxy recomputes it from the current config on every request, so
// rotating an org's password (or removing the org) logs that org out without
// affecting anyone else. Web Crypto keeps this runnable in the proxy on any
// runtime; 16 hex chars (64 bits) is plenty for a revocation check.
export async function passwordFingerprint(password: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`fp:${password}`)));
  return Array.from(mac.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}
