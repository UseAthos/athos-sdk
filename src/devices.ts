// Browser-support gate (D-49). Pure and UA-string-injectable so it is unit-tested
// headlessly. Athos roleplay runs on desktop Chromium-family browsers + desktop
// Firefox ONLY — Safari (desktop + iOS) and any mobile browser are unsupported,
// and the reseller's frontend is expected to detect this and prompt the user to
// switch.

export interface BrowserSupport {
  supported: boolean;
  reason?: "safari" | "mobile" | "unknown";
}

export function detectBrowserSupport(userAgent: string): BrowserSupport {
  const ua = userAgent;
  // Any mobile UA is unsupported (no mobile in v1).
  if (/Android|iPhone|iPad|iPod|Mobile|Mobi/i.test(ua)) {
    return { supported: false, reason: "mobile" };
  }
  const isChromium = /Chrome|Chromium|Edg|CriOS|OPR/i.test(ua);
  const isFirefox = /Firefox|FxiOS/i.test(ua);
  // Safari advertises "Safari" but lacks the Chromium / Firefox tokens.
  const isSafari = /Safari/i.test(ua) && !isChromium && !isFirefox;
  if (isSafari) return { supported: false, reason: "safari" };
  if (isChromium || isFirefox) return { supported: true };
  // Default-deny: D-49 is an allowlist (Chromium-family + Firefox only).
  return { supported: false, reason: "unknown" };
}
