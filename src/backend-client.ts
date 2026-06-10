import { AthosRoleplayError } from "./errors";
import type { AthosErrorCode } from "./types";

// Default to production. The example harness / tests pass `apiBase` to point at
// localhost. The reseller never sees a transport URL — only this Athos REST base.
const DEFAULT_API_BASE = "https://app.useathos.ai";

export interface RedeemSessionBody {
  drillKey: string;
  filters?: { state?: string; category?: string };
  difficulty?: "Beginner" | "Advanced" | "Elite";
}

/**
 * The redemption response contract (D-36). `connectionTicket` + `connectionUrl`
 * are opaque to the consumer — they carry the (hidden) voice transport. No
 * LiveKit noun appears here.
 */
export interface RedeemSessionResult {
  connectionTicket: string;
  connectionUrl: string;
  sessionId: string;
  callId: string;
  persona: { name: string };
}

/** Redeem a JIT JWT for a connection ticket via POST /api/external/v1/roleplay/session. */
export async function redeemSession(
  token: string,
  body: RedeemSessionBody,
  apiBase?: string,
): Promise<RedeemSessionResult> {
  const base = (apiBase ?? DEFAULT_API_BASE).replace(/\/$/, "");
  const res = await fetch(`${base}/api/external/v1/roleplay/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // Surface the external error envelope { error: { code, message, requestId } }.
    // The server is contractually within the D-38 taxonomy, so the code is cast
    // to AthosErrorCode; an unrecognized code is still surfaced verbatim.
    let code: AthosErrorCode = "INTERNAL_ERROR";
    let message = `Roleplay session request failed (${res.status})`;
    try {
      const json = (await res.json()) as {
        error?: { code?: string; message?: string };
      };
      if (json.error?.code) code = json.error.code as AthosErrorCode;
      if (json.error?.message) message = json.error.message;
    } catch {
      // Non-JSON body — keep the generic message.
    }
    throw new AthosRoleplayError(code, message);
  }

  return (await res.json()) as RedeemSessionResult;
}
