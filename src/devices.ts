// The two device gates a call passes before it exists: which browser is running
// (pure, UA-string-injectable, so it is unit-tested headlessly) and whether the
// rep will actually grant a microphone (touches `navigator.mediaDevices`).
//
// Athos roleplay runs on desktop Chromium-family browsers + desktop Firefox ONLY
// — Safari (desktop + iOS) and any mobile browser are unsupported, and the
// reseller's frontend is expected to detect this and prompt the user to switch.

import { AthosRoleplayError, toFailure, translateTransportError } from "./errors";

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

/**
 * Ask for the microphone and release it again, raising a domain error if the rep
 * refuses or has no input device.
 *
 * Called BEFORE the token is redeemed, and the ordering is the point. Redeeming
 * spends the single-use token and starts a billable session, so asking for the
 * mic afterwards charges a rep who then blocks the prompt. It also removes a
 * silent hang: a browser leaves `getUserMedia` pending — neither resolved nor
 * rejected — while its permission prompt goes unanswered, so a mic request made
 * after joining strands a consumer waiting on `ready` while the persona is
 * already talking. Gating first means an unanswered prompt costs nothing and
 * leaves the same token usable on a retry.
 *
 * The tracks are stopped immediately so the transport re-acquires the device
 * cleanly once the session is live. A grant normally satisfies that second
 * acquisition without prompting again, but it is not a guarantee: browsers issue
 * temporary grants that expire (Firefox's un-remembered grant, Chrome's one-time
 * permission), so a lapse between here and publication can still raise a prompt
 * the rep has already answered once. Narrow, and far from a first-run refusal.
 */
export async function requestMicrophoneAccess(): Promise<void> {
  const media =
    typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  if (typeof media?.getUserMedia !== "function") {
    // Absent rather than denied: browsers withhold the whole API on a non-secure
    // origin. Same user-visible outcome as having no input device, so it reuses
    // that code rather than widening the taxonomy.
    throw new AthosRoleplayError(
      "NO_MIC_AVAILABLE",
      "Microphone access is unavailable in this context. Serve the page over HTTPS.",
    );
  }

  let stream: MediaStream;
  try {
    stream = await media.getUserMedia({ audio: true });
  } catch (e) {
    throw translateTransportError(toFailure(e));
  }
  stream.getTracks().forEach((track) => track.stop());
}
