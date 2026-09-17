// The public, semver-stable contract of @useathos/sdk: the drill catalog, the
// create() options, the event map, the error taxonomy and the session handle.
// Every doc comment in this file ships in dist/index.d.ts and is read by
// customers on editor hover — keep it customer-facing (see CLAUDE.md).

/**
 * The drills Athos can run today.
 *
 * The catalog is **append-only**: a key is added when a new drill goes live and
 * is never renamed or removed, so a key you ship today keeps working.
 *
 * This type is **opt-in**. `AthosRoleplayCreateOptions.drillKey` is deliberately
 * `string`, so a drill newly enabled on the Athos side works without upgrading
 * this package and you can pass a key straight from your own config or database.
 * Unknown keys are rejected by the server with `DRILL_NOT_FOUND`. Use this type
 * (and `ATHOS_DRILL_KEYS`) when you would rather have the compile-time check.
 */
export type AthosDrillKey = "ma-full-sale" | "fe-full-sale";

/**
 * All available drill keys as a runtime list, e.g. for rendering a scenario
 * picker. Frozen: the array instance is shared by every module that imports this
 * package, so mutating it would corrupt the catalog for all of them.
 */
export const ATHOS_DRILL_KEYS: readonly AthosDrillKey[] = Object.freeze([
  "ma-full-sale",
  "fe-full-sale",
]);

export interface AthosRoleplayCreateOptions {
  /**
   * Single-use session token, minted by your backend at the moment the rep
   * starts a call.
   */
  token: string;
  /**
   * Which drill to practice, e.g. "ma-full-sale" or "fe-full-sale". Required.
   *
   * Deliberately `string`, not `AthosDrillKey` — a drill newly enabled on the
   * Athos side must work without upgrading this package. Unknown keys are
   * rejected by the server with `DRILL_NOT_FOUND`. Opt in to compile-time
   * checking with the `AthosDrillKey` type / `ATHOS_DRILL_KEYS` list.
   */
  drillKey: string;
  /**
   * Best-effort persona filters: honored when a matching persona exists,
   * otherwise dropped so an unfiltered persona is served — a filter never fails
   * a call. Only a drill with no available persona at all fails, as
   * `SERVICE_UNAVAILABLE`; that is transient, but the attempt consumes the
   * session token, so recover by minting a new token rather than retrying the
   * same one.
   */
  filters?: { state?: string; category?: string };
  /** Persona difficulty. Defaults to "Advanced". */
  difficulty?: "Beginner" | "Advanced" | "Elite";
  /** Console logs prefixed "[Athos]". */
  debug?: boolean;
  /**
   * @internal Override the Athos API base URL (defaults to production).
   * Used by the example harness / tests to point at localhost.
   */
  apiBase?: string;
}

/**
 * The full event union. There is deliberately no live `transcript` event — the
 * diarized transcript is delivered after the call through the REST API
 * (`GET /v1/calls/:callId`), not streamed during it.
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
  /** A transient connection drop is being recovered automatically. */
  reconnecting: void;
  /** The connection recovered after a transient drop. */
  reconnected: void;
  /** The call ended; carries the stable call id + wall-clock duration. */
  ended: { callId: string; durationSec: number };
  /** An error. Branch on `code`; `message` is human-readable only. */
  error: { code: AthosErrorCode; message: string };
}

export type AthosEventName = keyof AthosEventMap;

/**
 * The Athos error taxonomy, shared by this SDK and the Athos HTTP API. Branch on
 * `code`; `message` is human-readable and NOT machine-parsable.
 *
 * This is the full shared set, so not every code is reachable from the SDK — for
 * example `INVALID_API_KEY` only applies to the token-minting call your backend
 * makes. The list is append-only: branch on the codes you know and log the rest.
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
  // --- Codes returned by the Athos HTTP API ---
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
  | "AGENT_ALREADY_EXISTS"
  | "AGENCY_NOT_FOUND"
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
  "AGENT_ALREADY_EXISTS",
  "AGENCY_NOT_FOUND",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
];

/** A selectable microphone input. */
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
