import type { AthosErrorCode } from "./types";

/**
 * An SDK error carrying an Athos-domain code (D-38). Consumers branch on `code`;
 * `message` is human-readable and NOT machine-parsable.
 */
export class AthosRoleplayError extends Error {
  readonly code: AthosErrorCode;
  constructor(code: AthosErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AthosRoleplayError";
  }
}

/**
 * A transport-layer fault, expressed as plain data. The hidden voice transport
 * converts every vendor value (a thrown `DOMException`, a disconnect reason, an
 * autoplay block) into one of these BEFORE it crosses back to the session — so
 * the translation logic here stays pure and unit-testable, with no vendor import.
 */
export type TransportFailure =
  /** A `navigator.mediaDevices` / device fault; `name` is the DOMException name. */
  | { kind: "mediaDevice"; name: string }
  /** The active microphone disappeared mid-call. */
  | { kind: "deviceRemoved" }
  /** Auto-reconnect exceeded its deadline (D-52). */
  | { kind: "reconnectTimeout" }
  /** The browser blocked audio autoplay. */
  | { kind: "audioPlaybackBlocked" }
  /** Anything unclassified. */
  | { kind: "unknown"; message?: string };

/** Translate a transport-layer fault into a domain error (D-38). Pure. */
export function translateTransportError(
  failure: TransportFailure,
): AthosRoleplayError {
  switch (failure.kind) {
    case "mediaDevice":
      return translateMediaDeviceError(failure.name);
    case "deviceRemoved":
      return new AthosRoleplayError(
        "MIC_DEVICE_DISCONNECTED",
        "The active microphone was disconnected.",
      );
    case "reconnectTimeout":
      return new AthosRoleplayError(
        "NETWORK_LOST",
        "The connection was lost and could not be recovered.",
      );
    case "audioPlaybackBlocked":
      return new AthosRoleplayError(
        "AUDIO_PLAYBACK_BLOCKED",
        "Audio playback was blocked by the browser; call resumeAudio() from a user gesture.",
      );
    case "unknown":
      return new AthosRoleplayError(
        "INTERNAL_ERROR",
        failure.message ?? "An unexpected error occurred.",
      );
  }
}

/** Map a DOMException name from a microphone operation to a domain code. */
function translateMediaDeviceError(name: string): AthosRoleplayError {
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return new AthosRoleplayError(
        "MIC_PERMISSION_DENIED",
        "Microphone permission was denied.",
      );
    case "NotFoundError":
    case "OverconstrainedError":
      return new AthosRoleplayError(
        "NO_MIC_AVAILABLE",
        "No microphone is available.",
      );
    case "NotReadableError":
    case "AbortError":
      return new AthosRoleplayError(
        "MIC_DEVICE_DISCONNECTED",
        "The microphone is no longer readable.",
      );
    default:
      return new AthosRoleplayError(
        "INTERNAL_ERROR",
        `Microphone error: ${name}`,
      );
  }
}
