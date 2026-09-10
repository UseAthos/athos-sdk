import type { AthosErrorCode } from "./types";

/**
 * An SDK error carrying an Athos error code. Branch on `code`;
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
  /** Auto-reconnect exceeded its deadline. */
  | { kind: "reconnectTimeout" }
  /** The browser blocked audio autoplay. */
  | { kind: "audioPlaybackBlocked" }
  /** Anything unclassified. */
  | { kind: "unknown"; message?: string };

/** Translate a transport-layer fault into an Athos domain error. Pure. */
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

/**
 * Classify an unknown thrown value (e.g. a `DOMException` from a microphone
 * operation) into a fault. Pure, and deliberately here rather than in the
 * transport: the pre-connect microphone gate raises the same DOMExceptions
 * without any transport involved, and both paths must land on the same codes.
 */
export function toFailure(e: unknown): TransportFailure {
  if (e instanceof Error) {
    // DOMExceptions from getUserMedia / device ops carry a meaningful `.name`.
    if (e.name && e.name !== "Error" && e.name.endsWith("Error")) {
      return { kind: "mediaDevice", name: e.name };
    }
    return { kind: "unknown", message: e.message };
  }
  return { kind: "unknown" };
}
