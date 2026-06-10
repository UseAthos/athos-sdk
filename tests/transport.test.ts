import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// A controllable fake of the LiveKit room, so the transport's reconnect / speaking
// / mic translation runs headlessly (no real WebRTC). vi.hoisted keeps the class
// available to the hoisted vi.mock factory below.
const { FakeRoom, state } = vi.hoisted(() => {
  const state: { rooms: any[]; devices: { deviceId: string; label: string }[] } = {
    rooms: [],
    devices: [{ deviceId: "mic-default", label: "Default" }],
  };
  class FakeRoom {
    handlers = new Map<string, ((...a: any[]) => void)[]>();
    localParticipant = {
      sid: "local",
      micEnableCalls: [] as boolean[],
      async setMicrophoneEnabled(v: boolean) {
        this.micEnableCalls.push(v);
      },
    };
    canPlaybackAudio = true;
    connectArgs: any[] | null = null;
    disconnectCount = 0;
    startAudioCount = 0;
    switchCalls: [string, string][] = [];
    constructor() {
      state.rooms.push(this);
    }
    on(event: string, cb: (...a: any[]) => void) {
      const list = this.handlers.get(event) ?? [];
      list.push(cb);
      this.handlers.set(event, list);
      return this;
    }
    emit(event: string, ...args: any[]) {
      (this.handlers.get(event) ?? []).slice().forEach((cb) => cb(...args));
    }
    async connect(...a: any[]) {
      this.connectArgs = a;
    }
    async disconnect() {
      this.disconnectCount++;
    }
    getActiveDevice() {
      return "mic-default";
    }
    async startAudio() {
      this.startAudioCount++;
    }
    async switchActiveDevice(kind: string, id: string) {
      this.switchCalls.push([kind, id]);
      return true;
    }
    static async getLocalDevices() {
      return state.devices;
    }
  }
  return { FakeRoom, state };
});

vi.mock("livekit-client", () => ({
  Room: FakeRoom,
  RoomEvent: {
    TrackSubscribed: "trackSubscribed",
    Disconnected: "disconnected",
    Reconnecting: "reconnecting",
    Reconnected: "reconnected",
    ActiveSpeakersChanged: "activeSpeakersChanged",
    MediaDevicesError: "mediaDevicesError",
    AudioPlaybackStatusChanged: "audioPlaybackChanged",
    MediaDevicesChanged: "mediaDevicesChanged",
  },
  Track: { Kind: { Audio: "audio" } },
}));

import { LiveKitTransport } from "../src/transport/livekit-transport";

type Ev = [string, any?];
function makeCallbacks() {
  const events: Ev[] = [];
  const cb = {
    onReady: (p: any) => events.push(["ready", p]),
    onEnded: (p: any) => events.push(["ended", p]),
    onError: (p: any) => events.push(["error", p]),
    onReconnecting: () => events.push(["reconnecting"]),
    onReconnected: () => events.push(["reconnected"]),
    onPersonaSpeaking: (p: any) => events.push(["personaSpeaking", p]),
    onUserSpeaking: (p: any) => events.push(["userSpeaking", p]),
  };
  return { events, cb };
}
const PARAMS = {
  connectionUrl: "opaque-url",
  connectionTicket: "opaque-ticket",
  callId: "call_1",
  personaName: "Margaret",
};
const lastRoom = () => state.rooms.at(-1)!;

beforeEach(() => {
  state.rooms.length = 0;
  state.devices = [{ deviceId: "mic-default", label: "Default" }];
});
afterEach(() => {
  vi.useRealTimers();
});

describe("LiveKitTransport", () => {
  it("publishes the rep's microphone on connect and emits ready (CR-19)", async () => {
    const t = new LiveKitTransport();
    const { events, cb } = makeCallbacks();
    await t.connect(PARAMS, cb);
    expect(lastRoom().localParticipant.micEnableCalls).toContain(true);
    expect(events).toContainEqual(["ready", { persona: { name: "Margaret" } }]);
  });

  it("emits reconnecting then reconnected on a transient drop (D-52)", async () => {
    const t = new LiveKitTransport();
    const { events, cb } = makeCallbacks();
    await t.connect(PARAMS, cb);
    lastRoom().emit("reconnecting");
    lastRoom().emit("reconnected");
    expect(events.map((e) => e[0])).toEqual(
      expect.arrayContaining(["reconnecting", "reconnected"]),
    );
    expect(events.find((e) => e[0] === "error")).toBeUndefined();
  });

  it("hard-fails to NETWORK_LOST after 30s and tears the session down (D-52)", async () => {
    const t = new LiveKitTransport();
    const { events, cb } = makeCallbacks();
    await t.connect(PARAMS, cb);
    vi.useFakeTimers();
    lastRoom().emit("reconnecting");
    vi.advanceTimersByTime(30_000);
    const err = events.find((e) => e[0] === "error");
    expect(err?.[1].code).toBe("NETWORK_LOST");
    expect(lastRoom().disconnectCount).toBeGreaterThanOrEqual(1);
  });

  it("clears the timeout when reconnected in time (no NETWORK_LOST)", async () => {
    const t = new LiveKitTransport();
    const { events, cb } = makeCallbacks();
    await t.connect(PARAMS, cb);
    vi.useFakeTimers();
    lastRoom().emit("reconnecting");
    vi.advanceTimersByTime(10_000);
    lastRoom().emit("reconnected");
    vi.advanceTimersByTime(30_000);
    expect(events.find((e) => e[0] === "error")).toBeUndefined();
  });

  it("translates active speakers into userSpeaking / personaSpeaking (deduped)", async () => {
    const t = new LiveKitTransport();
    const { events, cb } = makeCallbacks();
    await t.connect(PARAMS, cb);
    lastRoom().emit("activeSpeakersChanged", [{ sid: "local" }]); // rep speaks
    lastRoom().emit("activeSpeakersChanged", [{ sid: "persona-1" }]); // persona speaks, rep stops
    lastRoom().emit("activeSpeakersChanged", [{ sid: "persona-1" }]); // no change → no dup
    expect(events).toContainEqual(["userSpeaking", { speaking: true }]);
    expect(events).toContainEqual(["personaSpeaking", { speaking: true }]);
    expect(events).toContainEqual(["userSpeaking", { speaking: false }]);
    expect(events.filter((e) => e[0] === "personaSpeaking")).toHaveLength(1);
  });

  it("emits MIC_DEVICE_DISCONNECTED when the active mic vanishes mid-call", async () => {
    const t = new LiveKitTransport();
    const { events, cb } = makeCallbacks();
    await t.connect(PARAMS, cb);
    state.devices = []; // unplugged
    lastRoom().emit("mediaDevicesChanged");
    await vi.waitFor(() =>
      expect(events.find((e) => e[0] === "error")?.[1].code).toBe(
        "MIC_DEVICE_DISCONNECTED",
      ),
    );
  });

  it("emits AUDIO_PLAYBACK_BLOCKED when autoplay is blocked", async () => {
    const t = new LiveKitTransport();
    const { events, cb } = makeCallbacks();
    await t.connect(PARAMS, cb);
    lastRoom().canPlaybackAudio = false;
    lastRoom().emit("audioPlaybackChanged");
    expect(events.find((e) => e[0] === "error")?.[1].code).toBe(
      "AUDIO_PLAYBACK_BLOCKED",
    );
  });

  it("switches the active mic mid-call without disconnecting (no drop)", async () => {
    const t = new LiveKitTransport();
    const { cb } = makeCallbacks();
    await t.connect(PARAMS, cb);
    await t.setMicrophone("mic-2");
    expect(lastRoom().switchCalls).toContainEqual(["audioinput", "mic-2"]);
    expect(lastRoom().disconnectCount).toBe(0);
  });

  it("rejects session controls before connect with a clear error (CR-22)", async () => {
    const t = new LiveKitTransport();
    await expect(t.setMicrophone("mic-2")).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
    await expect(t.mute()).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    await expect(t.resumeAudio()).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });
});
