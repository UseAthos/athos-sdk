// connect() ordering. The mic gate has to run BEFORE the redeem, because the
// redeem spends the single-use token and starts a billable session: a rep who
// blocks the prompt must cost nothing and keep a token they can retry with.
// These tests pin the ordering itself, not just the error code.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { calls, redeemSession, transportConnect, transportDisconnect } = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    calls,
    transportDisconnect: vi.fn(async () => {
      calls.push("transport.disconnect");
    }),
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
    disconnect = transportDisconnect;
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
  transportDisconnect.mockClear();
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

describe("cancelling during the microphone prompt", () => {
  /** A getUserMedia the test settles by hand, standing in for an open prompt. */
  function deferredMic() {
    let grant!: () => void;
    const pending = new Promise<void>((res) => {
      grant = res;
    });
    const getUserMedia = vi.fn(async () => {
      calls.push("getUserMedia");
      await pending;
      return { getTracks: () => [{ stop: () => calls.push("track.stop") }] };
    });
    return { getUserMedia, grant: () => grant() };
  }

  it("spends nothing when the consumer cancels while the prompt is open", async () => {
    const { getUserMedia, grant } = deferredMic();
    stubNavigator(getUserMedia);
    const session = AthosRoleplay.create({ token: "t", drillKey: "ma-full-sale" });

    const connecting = session.connect();
    await session.disconnect(); // the rep hit cancel with the prompt still up
    grant(); // …and only then answered the browser
    await connecting;

    // The window here is unbounded — it is a human answering a dialog — so a
    // cancelled call must not quietly become a billed one behind their back.
    expect(redeemSession).not.toHaveBeenCalled();
    expect(transportConnect).not.toHaveBeenCalled();
  });

  it("releases the microphone it acquired after the cancel", async () => {
    const { getUserMedia, grant } = deferredMic();
    stubNavigator(getUserMedia);
    const session = AthosRoleplay.create({ token: "t", drillKey: "ma-full-sale" });

    const connecting = session.connect();
    await session.disconnect();
    grant();
    await connecting;

    // Otherwise the browser's recording indicator stays lit on a cancelled call.
    expect(calls).toContain("track.stop");
  });

  it("stays terminal after a cancel — no ready, no reconnect", async () => {
    const { getUserMedia, grant } = deferredMic();
    stubNavigator(getUserMedia);
    const session = AthosRoleplay.create({ token: "t", drillKey: "ma-full-sale" });
    const events: string[] = [];
    session.on("ready", () => events.push("ready"));
    session.on("error", ({ code }) => events.push(`error:${code}`));

    const connecting = session.connect();
    await session.disconnect();
    grant();
    await connecting;

    expect(events).toEqual([]);
    // disconnect() is terminal: the session object is spent either way.
    await expect(session.connect()).rejects.toMatchObject({
      code: "SESSION_ALREADY_CONNECTED",
    });
  });

  it("does not join a room when the cancel lands during redemption", async () => {
    stubNavigator(grantingMic());
    let finishRedeem!: () => void;
    const held = new Promise<void>((res) => {
      finishRedeem = res;
    });
    redeemSession.mockImplementationOnce(async () => {
      calls.push("redeem");
      await held;
      return {
        callId: "call_1",
        connectionUrl: "wss://example.invalid",
        connectionTicket: "ticket",
        persona: { name: "Ruth" },
      };
    });

    const session = AthosRoleplay.create({ token: "t", drillKey: "ma-full-sale" });
    const connecting = session.connect();
    await Promise.resolve(); // let connect() reach the redeem
    await session.disconnect();
    finishRedeem();
    await connecting;

    // The token is already spent here — that is unavoidable and the sweep
    // reclaims the call. Joining on top of it is not.
    expect(transportConnect).not.toHaveBeenCalled();
  });

  it("tears the room back down when the cancel lands as the call goes live", async () => {
    stubNavigator(grantingMic());
    let finishJoin!: () => void;
    const held = new Promise<void>((res) => {
      finishJoin = res;
    });
    let joinStarted!: () => void;
    const joining = new Promise<void>((res) => {
      joinStarted = res;
    });
    transportConnect.mockImplementationOnce(async (_p: unknown, cb: any) => {
      calls.push("transport.connect");
      joinStarted();
      await held;
      cb.onReady({ persona: { name: "Ruth" } });
    });

    const session = AthosRoleplay.create({ token: "t", drillKey: "ma-full-sale" });
    const ready: string[] = [];
    session.on("ready", () => ready.push("ready"));

    const connecting = session.connect();
    await joining; // the room join is genuinely in flight
    await session.disconnect();
    finishJoin();
    await connecting;

    // Two disconnects: the consumer's no-op one, then ours once a room existed.
    expect(transportDisconnect).toHaveBeenCalledTimes(2);
    expect(ready).toEqual(["ready"]); // the transport had already fired it
  });
});
