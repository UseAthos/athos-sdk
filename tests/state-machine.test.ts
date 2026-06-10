import { describe, it, expect } from "vitest";
import { SessionStateMachine } from "../src/state-machine";

describe("SessionStateMachine", () => {
  it("starts idle and only allows connect from idle", () => {
    const m = new SessionStateMachine();
    expect(m.state).toBe("idle");
    expect(m.canConnect()).toBe(true);
  });

  it("walks the happy path idle → connecting → connected → ended", () => {
    const m = new SessionStateMachine();
    expect(m.apply("CONNECT")).toBe("connecting");
    expect(m.canConnect()).toBe(false); // double-connect guard (D-55)
    expect(m.apply("CONNECTED")).toBe("connected");
    expect(m.apply("ENDED")).toBe("ended");
    expect(m.canConnect()).toBe(false);
  });

  it("blocks a second connect while connecting or connected (D-55)", () => {
    const m = new SessionStateMachine();
    m.apply("CONNECT");
    expect(m.canConnect()).toBe(false);
    // A spurious second CONNECT is not applicable and must not change state.
    expect(m.apply("CONNECT")).toBe("connecting");
    m.apply("CONNECTED");
    expect(m.canConnect()).toBe(false);
    expect(m.apply("CONNECT")).toBe("connected");
  });

  it("returns to idle on a failed connect so a retry is allowed", () => {
    const m = new SessionStateMachine();
    m.apply("CONNECT");
    expect(m.apply("CONNECT_FAILED")).toBe("idle");
    expect(m.canConnect()).toBe(true);
  });

  it("supports the reconnect round-trip connected → reconnecting → connected (D-52)", () => {
    const m = new SessionStateMachine();
    m.apply("CONNECT");
    m.apply("CONNECTED");
    expect(m.apply("RECONNECTING")).toBe("reconnecting");
    expect(m.canConnect()).toBe(false);
    expect(m.apply("RECONNECTED")).toBe("connected");
  });

  it("ends from reconnecting when recovery fails (network lost)", () => {
    const m = new SessionStateMachine();
    m.apply("CONNECT");
    m.apply("CONNECTED");
    m.apply("RECONNECTING");
    expect(m.apply("ENDED")).toBe("ended");
  });

  it("is terminal once ended — no further transitions apply", () => {
    const m = new SessionStateMachine();
    m.apply("CONNECT");
    m.apply("CONNECTED");
    m.apply("ENDED");
    expect(m.apply("RECONNECTING")).toBe("ended");
    expect(m.apply("CONNECT")).toBe("ended");
    expect(m.apply("CONNECTED")).toBe("ended");
  });

  it("disconnect ends the session from any live state", () => {
    const connecting = new SessionStateMachine();
    connecting.apply("CONNECT");
    expect(connecting.apply("DISCONNECT")).toBe("ended");

    const connected = new SessionStateMachine();
    connected.apply("CONNECT");
    connected.apply("CONNECTED");
    expect(connected.apply("DISCONNECT")).toBe("ended");
  });
});
