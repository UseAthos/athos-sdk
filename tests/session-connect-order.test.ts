// connect() ordering. The mic gate has to run BEFORE the redeem, because the
// redeem spends the single-use token and starts a billable session: a rep who
// blocks the prompt must cost nothing and keep a token they can retry with.
// These tests pin the ordering itself, not just the error code.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { calls, redeemSession, transportConnect } = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    calls,
    redeemSession: vi.fn(async () => {
      calls.push("redeem");
      return {
        callId: "call_1",
        connectionUrl: "wss://example.invalid",
        connectionTicket: "ticket",
        persona: { name: "Ruth" },
      };
    }),
    transportConnect: vi.fn(async (_p: unknown, cb: any) => {
      calls.push("transport.connect");
      cb.onReady({ persona: { name: "Ruth" } });
    }),
  };
});

vi.mock("../src/backend-client", () => ({ redeemSession }));
vi.mock("../src/transport/livekit-transport", () => ({
  LiveKitTransport: class {
    connect = transportConnect;
    async disconnect() {}
    async listMicrophones() {
      return [];
    }
    async setMicrophone() {}
    async mute() {}
    async unmute() {}
    async resumeAudio() {}
  },
}));

import { AthosRoleplay } from "../src/session";

/** getUserMedia that grants, recording the call order. */
function grantingMic() {
  return vi.fn(async () => {
    calls.push("getUserMedia");
    return { getTracks: () => [{ stop: () => {} }] };
  });
}

/** getUserMedia that rejects the way a blocked prompt does. */
function denyingMic() {
  return vi.fn(async () => {
    calls.push("getUserMedia");
    const e = new Error("denied");
    e.name = "NotAllowedError";
    throw e;
  });
}

function stubNavigator(getUserMedia: () => Promise<unknown>) {
  vi.stubGlobal("navigator", {
    userAgent: "Mozilla/5.0 Chrome/131.0.0.0",
    mediaDevices: { getUserMedia },
  });
}

beforeEach(() => {
  calls.length = 0;
  redeemSession.mockClear();
  transportConnect.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("connect() ordering", () => {
  it("asks for the mic before redeeming the token", async () => {
    stubNavigator(grantingMic());
    const session = AthosRoleplay.create({ token: "t", drillKey: "ma-full-sale" });

    await session.connect();

    expect(calls).toEqual(["getUserMedia", "redeem", "transport.connect"]);
  });

  it("spends nothing when the rep blocks the prompt", async () => {
    stubNavigator(denyingMic());
    const session = AthosRoleplay.create({ token: "t", drillKey: "ma-full-sale" });

    await expect(session.connect()).rejects.toMatchObject({
      code: "MIC_PERMISSION_DENIED",
    });

    expect(redeemSession).not.toHaveBeenCalled();
    expect(transportConnect).not.toHaveBeenCalled();
  });

  it("delivers the denial to both consumer styles, after `connecting`", async () => {
    stubNavigator(denyingMic());
    const session = AthosRoleplay.create({ token: "t", drillKey: "ma-full-sale" });
    const events: string[] = [];
    session.on("connecting", () => events.push("connecting"));
    session.on("error", ({ code }) => events.push(`error:${code}`));

    await session.connect().catch(() => {});

    // `connecting` first: the gate runs inside the guarded window, so a second
    // connect() during the browser prompt is still refused as a double-connect.
    expect(events).toEqual(["connecting", "error:MIC_PERMISSION_DENIED"]);
  });

  it("lets the SAME token retry once permission is granted", async () => {
    const mic = vi
      .fn()
      .mockImplementationOnce(async () => {
        const e = new Error("denied");
        e.name = "NotAllowedError";
        throw e;
      })
      .mockImplementationOnce(async () => ({ getTracks: () => [{ stop: () => {} }] }));
    stubNavigator(mic as unknown as () => Promise<unknown>);

    const session = AthosRoleplay.create({ token: "t", drillKey: "ma-full-sale" });
    await session.connect().catch(() => {});

    // Not SESSION_ALREADY_CONNECTED: a gate failure leaves no live session, so
    // the machine is back at idle and the unspent token is still good.
    await expect(session.connect()).resolves.toBeUndefined();
    expect(redeemSession).toHaveBeenCalledTimes(1);
    expect(redeemSession).toHaveBeenCalledWith(
      "t",
      expect.objectContaining({ drillKey: "ma-full-sale" }),
      undefined,
    );
  });

  it("still refuses a second connect() while the first is live", async () => {
    stubNavigator(grantingMic());
    const session = AthosRoleplay.create({ token: "t", drillKey: "ma-full-sale" });
    await session.connect();

    await expect(session.connect()).rejects.toMatchObject({
      code: "SESSION_ALREADY_CONNECTED",
    });
  });
});
