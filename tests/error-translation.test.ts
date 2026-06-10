import { describe, it, expect } from "vitest";
import { translateTransportError, AthosRoleplayError } from "../src/errors";

describe("translateTransportError", () => {
  it("maps microphone permission denial → MIC_PERMISSION_DENIED", () => {
    for (const name of ["NotAllowedError", "SecurityError"]) {
      const err = translateTransportError({ kind: "mediaDevice", name });
      expect(err).toBeInstanceOf(AthosRoleplayError);
      expect(err.code).toBe("MIC_PERMISSION_DENIED");
    }
  });

  it("maps no-device errors → NO_MIC_AVAILABLE", () => {
    for (const name of ["NotFoundError", "OverconstrainedError"]) {
      expect(translateTransportError({ kind: "mediaDevice", name }).code).toBe(
        "NO_MIC_AVAILABLE",
      );
    }
  });

  it("maps unreadable / aborted device → MIC_DEVICE_DISCONNECTED", () => {
    for (const name of ["NotReadableError", "AbortError"]) {
      expect(translateTransportError({ kind: "mediaDevice", name }).code).toBe(
        "MIC_DEVICE_DISCONNECTED",
      );
    }
  });

  it("maps a removed active mic → MIC_DEVICE_DISCONNECTED", () => {
    expect(translateTransportError({ kind: "deviceRemoved" }).code).toBe(
      "MIC_DEVICE_DISCONNECTED",
    );
  });

  it("maps reconnect timeout → NETWORK_LOST (D-52)", () => {
    expect(translateTransportError({ kind: "reconnectTimeout" }).code).toBe(
      "NETWORK_LOST",
    );
  });

  it("maps blocked autoplay → AUDIO_PLAYBACK_BLOCKED", () => {
    expect(translateTransportError({ kind: "audioPlaybackBlocked" }).code).toBe(
      "AUDIO_PLAYBACK_BLOCKED",
    );
  });

  it("falls back to INTERNAL_ERROR for unknown device names and unknown faults", () => {
    expect(
      translateTransportError({ kind: "mediaDevice", name: "WeirdError" }).code,
    ).toBe("INTERNAL_ERROR");
    const unknown = translateTransportError({
      kind: "unknown",
      message: "boom",
    });
    expect(unknown.code).toBe("INTERNAL_ERROR");
    expect(unknown.message).toBe("boom");
  });

  it("never leaks a vendor noun in the human-readable message", () => {
    const messages = [
      translateTransportError({ kind: "reconnectTimeout" }).message,
      translateTransportError({ kind: "audioPlaybackBlocked" }).message,
      translateTransportError({ kind: "deviceRemoved" }).message,
      translateTransportError({ kind: "mediaDevice", name: "NotAllowedError" })
        .message,
    ];
    for (const m of messages) {
      expect(m).not.toMatch(/Room|Participant|Track|LiveKit/);
    }
  });
});
