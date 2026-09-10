// The pre-connect microphone gate. Its job is not just to surface a denial —
// it is to surface it BEFORE the token is spent, so every case here asserts the
// domain code a consumer branches on.
import { describe, it, expect, vi, afterEach } from "vitest";
import { requestMicrophoneAccess } from "../src/devices";
import { AthosRoleplayError } from "../src/errors";

function fakeStream(trackCount = 1) {
  const stopped: boolean[] = [];
  const tracks = Array.from({ length: trackCount }, (_, i) => ({
    stop: () => {
      stopped[i] = true;
    },
  }));
  return { stream: { getTracks: () => tracks }, stopped };
}

/** Install a navigator whose getUserMedia does `impl`. */
function stubMedia(impl: (() => Promise<unknown>) | undefined) {
  vi.stubGlobal("navigator", {
    userAgent: "Mozilla/5.0 Chrome/131.0.0.0",
    mediaDevices: impl ? { getUserMedia: impl } : undefined,
  });
}

/** A DOMException-shaped rejection: what a browser actually throws. */
function domError(name: string) {
  const e = new Error(`${name} raised`);
  e.name = name;
  return e;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestMicrophoneAccess", () => {
  it("releases every track it acquired, so the transport re-acquires cleanly", async () => {
    const { stream, stopped } = fakeStream(2);
    stubMedia(async () => stream);

    await expect(requestMicrophoneAccess()).resolves.toBeUndefined();
    expect(stopped).toEqual([true, true]);
  });

  it("requests audio only — a roleplay call never asks for the camera", async () => {
    const { stream } = fakeStream();
    const getUserMedia = vi.fn(async () => stream);
    stubMedia(getUserMedia);

    await requestMicrophoneAccess();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it("maps a denied prompt to MIC_PERMISSION_DENIED", async () => {
    stubMedia(async () => {
      throw domError("NotAllowedError");
    });
    await expect(requestMicrophoneAccess()).rejects.toMatchObject({
      code: "MIC_PERMISSION_DENIED",
    });
  });

  it("maps a blocked permissions policy (SecurityError) to MIC_PERMISSION_DENIED", async () => {
    stubMedia(async () => {
      throw domError("SecurityError");
    });
    await expect(requestMicrophoneAccess()).rejects.toMatchObject({
      code: "MIC_PERMISSION_DENIED",
    });
  });

  it("maps a machine with no input device to NO_MIC_AVAILABLE", async () => {
    stubMedia(async () => {
      throw domError("NotFoundError");
    });
    await expect(requestMicrophoneAccess()).rejects.toMatchObject({
      code: "NO_MIC_AVAILABLE",
    });
  });

  it("maps a device held by another app to MIC_DEVICE_DISCONNECTED", async () => {
    stubMedia(async () => {
      throw domError("NotReadableError");
    });
    await expect(requestMicrophoneAccess()).rejects.toMatchObject({
      code: "MIC_DEVICE_DISCONNECTED",
    });
  });

  it("reports a missing mediaDevices API as NO_MIC_AVAILABLE, not a TypeError", async () => {
    // What a plain-http:// page sees: the API is withheld entirely. Without the
    // explicit check this would surface as INTERNAL_ERROR "cannot read
    // getUserMedia of undefined", which tells a partner nothing actionable.
    stubMedia(undefined);
    const err = await requestMicrophoneAccess().catch((e) => e);
    expect(err).toBeInstanceOf(AthosRoleplayError);
    expect(err.code).toBe("NO_MIC_AVAILABLE");
    expect(err.message).toMatch(/HTTPS/);
  });

  it("throws AthosRoleplayError, never a raw DOMException", async () => {
    stubMedia(async () => {
      throw domError("NotAllowedError");
    });
    const err = await requestMicrophoneAccess().catch((e) => e);
    expect(err).toBeInstanceOf(AthosRoleplayError);
    expect(err.name).toBe("AthosRoleplayError");
  });
});
