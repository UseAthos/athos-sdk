// Public, semver-protected contract for @useathos/sdk (D-56). The Slice 1
// names are locked; this is the full event/device/error surface (Slice 8). No
// vendor noun appears anywhere in this file — the voice transport is hidden
// (D-04/D-54).

/**
 * The friendly drill catalog (D-44). Mirrors `FRIENDLY_DRILL_KEYS` in
 * `lib/external/drill-key-map.ts` (the server's source of truth) — a root Jest
 * test asserts the two stay identical. OPT-IN tooling only: `drillKey` stays
 * `string` so a reseller can pass a newly enabled key (or one read from their
 * own config/DB) without a package bump — unknown keys are validated
 * server-side (DRILL_NOT_FOUND). Lists the drills currently available to
 * resellers; grows as new drills are enabled.
 */
export type AthosDrillKey = "ma-full-sale";

/** All available drill keys as a runtime list, e.g. for rendering a scenario picker. */
export const ATHOS_DRILL_KEYS: readonly AthosDrillKey[] = ["ma-full-sale"];

export interface AthosRoleplayCreateOptions {
  /** JIT single-use JWT minted by the reseller backend (D-05). */
  token: string;
  /**
   * Friendly drill key, e.g. "ma-full-sale" (D-44). REQUIRED (D-36).
   * Deliberately `string`, not `AthosDrillKey` — new server-side drills must
   * work without an SDK bump. Use the exported `AthosDrillKey` type and
   * `ATHOS_DRILL_KEYS` list to opt in to compile-time checking.
   */
  drillKey: string;
  /** Best-effort persona filters; silently falls back internally (D-36). */
  filters?: { state?: string; category?: string };
  /** Persona difficulty. Defaults to "Advanced" server-side (D-36). */
  difficulty?: "Beginner" | "Advanced" | "Elite";
  /** Console logs prefixed "[Athos]" (D-54). */
  debug?: boolean;
  /**
   * @internal Override the Athos API base URL (defaults to production).
   * Used by the example harness / tests to point at localhost.
   */
  apiBase?: string;
}

/**
 * The full discriminated event union (D-56). There is deliberately no live
 * `transcript` event (D-53) — the diarized transcript is delivered post-call via
 * the REST API (`GET /v1/calls/:callId`), not streamed during the call.
 */
export interface AthosEventMap {
  /** connect() was called; the token is being redeemed / the session joined. */
  connecting: void;
  /** The persona is ready to speak. */
  ready: { persona: { name: string } };
  /** The persona started (`true`) or stopped (`false`) speaking. */
  personaSpeaking: { speaking: boolean };
  /** The local rep started (`true`) or stopped (`false`) speaking. */
  userSpeaking: { speaking: boolean };
  /** A transient connection drop is being recovered automatically (D-52). */
  reconnecting: void;
  /** The connection recovered after a transient drop (D-52). */
  reconnected: void;
  /** The call ended; carries the stable call id + wall-clock duration. */
  ended: { callId: string; durationSec: number };
  /** A domain error. Branch on `code` (D-38); `message` is human-readable only. */
  error: { code: AthosErrorCode; message: string };
}

export type AthosEventName = keyof AthosEventMap;

/**
 * The Athos-domain error taxonomy (D-38), shared between the REST API and the
 * SDK. No vendor nouns. Consumers branch on `code`; `message` is human-readable
 * and NOT machine-parsable.
 *
 * The REST half mirrors `ExternalErrorCode` in `features/external-api/errors.ts`
 * (the server's source of truth) so the codes the redeem call surfaces are typed
 * truthfully. Not every REST code is reachable from the SDK's single redeem call
 * (e.g. `INVALID_API_KEY` is mint-only), but the union is the full shared set.
 */
export type AthosErrorCode =
  // --- SDK / browser-runtime codes (no HTTP status; emitted client-side) ---
  | "MIC_PERMISSION_DENIED"
  | "MIC_DEVICE_DISCONNECTED"
  | "NO_MIC_AVAILABLE"
  | "NETWORK_LOST"
  | "AUDIO_PLAYBACK_BLOCKED"
  | "BROWSER_NOT_SUPPORTED"
  | "SESSION_ALREADY_CONNECTED"
  // --- REST half of the D-38 taxonomy (features/external-api/errors.ts) ---
  | "INVALID_API_KEY"
  | "API_KEY_REVOKED"
  | "INVALID_TOKEN"
  | "TOKEN_EXPIRED"
  | "TOKEN_ALREADY_USED"
  | "IP_NOT_ALLOWED"
  | "TENANT_INACTIVE"
  | "TENANT_QUOTA_EXCEEDED"
  | "INVALID_REQUEST"
  | "DRILL_NOT_FOUND"
  | "CALL_NOT_FOUND"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

/** All error codes as a runtime list, for exhaustive consumer handling / tests. */
export const ATHOS_ERROR_CODES: readonly AthosErrorCode[] = [
  "MIC_PERMISSION_DENIED",
  "MIC_DEVICE_DISCONNECTED",
  "NO_MIC_AVAILABLE",
  "NETWORK_LOST",
  "AUDIO_PLAYBACK_BLOCKED",
  "BROWSER_NOT_SUPPORTED",
  "SESSION_ALREADY_CONNECTED",
  "INVALID_API_KEY",
  "API_KEY_REVOKED",
  "INVALID_TOKEN",
  "TOKEN_EXPIRED",
  "TOKEN_ALREADY_USED",
  "IP_NOT_ALLOWED",
  "TENANT_INACTIVE",
  "TENANT_QUOTA_EXCEEDED",
  "INVALID_REQUEST",
  "DRILL_NOT_FOUND",
  "CALL_NOT_FOUND",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
];

/** A selectable microphone input (D-49 device handling). */
export interface MicrophoneInfo {
  deviceId: string;
  label: string;
}

export interface AthosRoleplaySession {
  /** Redeem the JWT and join the session. */
  connect(): Promise<void>;
  /** Cleanly leave the session. */
  disconnect(): Promise<void>;
  /** Subscribe to an event. Returns an unsubscribe fn (SPA lifecycle hygiene). */
  on<E extends keyof AthosEventMap>(
    event: E,
    cb: (payload: AthosEventMap[E]) => void,
  ): () => void;
  off<E extends keyof AthosEventMap>(
    event: E,
    cb: (payload: AthosEventMap[E]) => void,
  ): void;
  /** Enumerate available microphones (may prompt for permission). */
  listMicrophones(): Promise<MicrophoneInfo[]>;
  /** Switch the active microphone mid-call without dropping the session. */
  setMicrophone(deviceId: string): Promise<void>;
  /** Mute the local microphone. */
  mute(): Promise<void>;
  /** Unmute the local microphone. */
  unmute(): Promise<void>;
  /**
   * Resume audio playback after an `AUDIO_PLAYBACK_BLOCKED` error. Must be called
   * from within a user-gesture handler (browsers only unblock autoplay then).
   */
  resumeAudio(): Promise<void>;
}
