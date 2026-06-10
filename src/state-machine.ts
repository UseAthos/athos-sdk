// Pure session lifecycle state machine. No transport, no DOM, no vendor import —
// so every transition (including the double-connect guard, D-55, and the
// reconnect path, D-52) is exercisable in a headless unit test.

export type SessionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "ended";

export type SessionEvent =
  | "CONNECT" // consumer called connect()
  | "CONNECTED" // transport reported the session is live
  | "CONNECT_FAILED" // connect() failed before any live session existed
  | "RECONNECTING" // transient drop, auto-recovering (D-52)
  | "RECONNECTED" // recovered (D-52)
  | "ENDED" // the call ended (clean leave or fatal error)
  | "DISCONNECT"; // consumer called disconnect()

const TRANSITIONS: Record<
  SessionState,
  Partial<Record<SessionEvent, SessionState>>
> = {
  idle: { CONNECT: "connecting" },
  connecting: {
    CONNECTED: "connected",
    CONNECT_FAILED: "idle", // back to idle so a genuine retry is allowed
    ENDED: "ended",
    DISCONNECT: "ended",
  },
  connected: {
    RECONNECTING: "reconnecting",
    ENDED: "ended",
    DISCONNECT: "ended",
  },
  reconnecting: {
    RECONNECTED: "connected",
    ENDED: "ended",
    DISCONNECT: "ended",
  },
  ended: {},
};

export class SessionStateMachine {
  private _state: SessionState = "idle";

  get state(): SessionState {
    return this._state;
  }

  /**
   * True only when a fresh `connect()` is permitted. A second connect() while
   * connecting/connected/reconnecting is rejected as SESSION_ALREADY_CONNECTED
   * by the caller (D-55).
   */
  canConnect(): boolean {
    return this._state === "idle";
  }

  /**
   * Apply an event if it is valid in the current state; otherwise no-op. Returns
   * the resulting state (unchanged when the event was not applicable).
   */
  apply(event: SessionEvent): SessionState {
    const next = TRANSITIONS[this._state][event];
    if (next !== undefined) this._state = next;
    return this._state;
  }
}
