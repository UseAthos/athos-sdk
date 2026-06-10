// THE ONLY file in the SDK permitted to import `livekit-client`. It translates
// the hidden voice transport into the public Athos event vocabulary — no vendor
// noun ever crosses back to the session, which sees only Athos-domain payloads.
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
} from "livekit-client";
import {
  translateTransportError,
  type TransportFailure,
} from "../errors";
import type { AthosEventMap, MicrophoneInfo } from "../types";
import type { ConnectParams, Transport, TransportCallbacks } from "./transport";

// Hard-fail deadline for auto-reconnect before we surface NETWORK_LOST (D-52).
const RECONNECT_TIMEOUT_MS = 30_000;

/** Build the public `error` payload from a transport-layer fault. */
function toErrorPayload(failure: TransportFailure): AthosEventMap["error"] {
  const err = translateTransportError(failure);
  return { code: err.code, message: err.message };
}

/** Classify an unknown thrown value (e.g. a DOMException) into a fault. */
function toFailure(e: unknown): TransportFailure {
  if (e instanceof Error) {
    // DOMExceptions from getUserMedia / device ops carry a meaningful `.name`.
    if (e.name && e.name !== "Error" && e.name.endsWith("Error")) {
      return { kind: "mediaDevice", name: e.name };
    }
    return { kind: "unknown", message: e.message };
  }
  return { kind: "unknown" };
}

export class LiveKitTransport implements Transport {
  private room: Room | null = null;
  private audioTrack: RemoteTrack | null = null;
  private startedAt = 0;
  private callId = "";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private personaSpeaking = false;
  private userSpeaking = false;
  private activeMicId: string | undefined;

  async connect(params: ConnectParams, cb: TransportCallbacks): Promise<void> {
    this.callId = params.callId;
    const room = new Room();
    this.room = room;

    // Agent audio → auto-create + manage an <audio> on document.body (D-51).
    room.on(RoomEvent.TrackSubscribed, (input: RemoteTrack) => {
      if (input.kind === Track.Kind.Audio) this.attachAudio(input);
    });

    // Session over → `ended` with wall-clock duration.
    room.on(RoomEvent.Disconnected, () => {
      this.clearReconnectTimer();
      const durationSec = this.startedAt
        ? Math.round((Date.now() - this.startedAt) / 1000)
        : 0;
      cb.onEnded({ callId: this.callId, durationSec });
    });

    // Auto-reconnect lifecycle (D-52): emit reconnecting/reconnected; if recovery
    // exceeds the deadline, surface NETWORK_LOST and tear the session down.
    room.on(RoomEvent.Reconnecting, () => {
      cb.onReconnecting();
      this.clearReconnectTimer();
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        cb.onError(toErrorPayload({ kind: "reconnectTimeout" }));
        void room.disconnect();
      }, RECONNECT_TIMEOUT_MS);
    });
    room.on(RoomEvent.Reconnected, () => {
      this.clearReconnectTimer();
      cb.onReconnected();
    });

    // Speaking state → personaSpeaking / userSpeaking (deduped to changes).
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      this.emitSpeaking(room, speakers, cb);
    });

    // Microphone / playback faults → MIC_* / AUDIO_PLAYBACK_BLOCKED.
    room.on(RoomEvent.MediaDevicesError, (e: Error) => {
      cb.onError(toErrorPayload({ kind: "mediaDevice", name: e.name }));
    });
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (!room.canPlaybackAudio) {
        cb.onError(toErrorPayload({ kind: "audioPlaybackBlocked" }));
      }
    });
    room.on(RoomEvent.MediaDevicesChanged, () => {
      void this.checkActiveMicPresent(cb);
    });

    try {
      await room.connect(params.connectionUrl, params.connectionTicket);
    } catch (e) {
      // Propagate so session.connect() owns error mapping (emits + rejects).
      this.room = null;
      throw e;
    }
    this.startedAt = Date.now();

    // Publish + capture the rep's microphone so the persona can hear them — a
    // roleplay call is two-way. Without this the rep is silent, `userSpeaking`
    // never fires, and mic switching has no track to act on. A permission denial
    // / missing device fails the connect with the right MIC_* code.
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (e) {
      await room.disconnect().catch(() => {});
      this.room = null;
      throw translateTransportError(toFailure(e));
    }
    this.activeMicId = room.getActiveDevice("audioinput");
    cb.onReady({ persona: { name: params.personaName } });
  }

  private emitSpeaking(
    room: Room,
    speakers: Participant[],
    cb: TransportCallbacks,
  ): void {
    const localSid = room.localParticipant.sid;
    const user = speakers.some((p) => p.sid === localSid);
    const persona = speakers.some((p) => p.sid !== localSid);
    if (user !== this.userSpeaking) {
      this.userSpeaking = user;
      cb.onUserSpeaking({ speaking: user });
    }
    if (persona !== this.personaSpeaking) {
      this.personaSpeaking = persona;
      cb.onPersonaSpeaking({ speaking: persona });
    }
  }

  /** When the device list changes, detect the active mic vanishing mid-call. */
  private async checkActiveMicPresent(cb: TransportCallbacks): Promise<void> {
    if (!this.activeMicId) return;
    const devices = await Room.getLocalDevices("audioinput");
    const stillPresent = devices.some((d) => d.deviceId === this.activeMicId);
    if (!stillPresent) {
      this.activeMicId = undefined;
      cb.onError(toErrorPayload({ kind: "deviceRemoved" }));
    }
  }

  /** Every session-scoped control needs a live session — fail loudly if not. */
  private requireRoom(): Room {
    if (!this.room) {
      throw translateTransportError({
        kind: "unknown",
        message: "No active session; call connect() first.",
      });
    }
    return this.room;
  }

  async listMicrophones(): Promise<MicrophoneInfo[]> {
    try {
      // Static enumeration (wraps navigator.mediaDevices) — works pre-connect.
      const devices = await Room.getLocalDevices("audioinput", true);
      return devices.map((d) => ({ deviceId: d.deviceId, label: d.label }));
    } catch (e) {
      throw translateTransportError(toFailure(e));
    }
  }

  async setMicrophone(deviceId: string): Promise<void> {
    const room = this.requireRoom();
    try {
      // Switches the input mid-call without dropping the session.
      await room.switchActiveDevice("audioinput", deviceId);
      this.activeMicId = deviceId;
    } catch (e) {
      throw translateTransportError(toFailure(e));
    }
  }

  async mute(): Promise<void> {
    const room = this.requireRoom();
    try {
      await room.localParticipant.setMicrophoneEnabled(false);
    } catch (e) {
      throw translateTransportError(toFailure(e));
    }
  }

  async unmute(): Promise<void> {
    const room = this.requireRoom();
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (e) {
      throw translateTransportError(toFailure(e));
    }
  }

  async resumeAudio(): Promise<void> {
    const room = this.requireRoom();
    try {
      // Must be invoked from a user gesture to clear AUDIO_PLAYBACK_BLOCKED.
      await room.startAudio();
    } catch (e) {
      throw translateTransportError(toFailure(e));
    }
  }

  private attachAudio(input: RemoteTrack): void {
    // Detach any previously-attached audio first (e.g. a re-subscribe after a
    // reconnect) so we don't orphan DOM elements or leak the prior reference.
    if (this.audioTrack) {
      for (const el of this.audioTrack.detach()) el.remove();
    }
    const el = input.attach();
    el.autoplay = true;
    document.body.appendChild(el);
    this.audioTrack = input;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  async disconnect(): Promise<void> {
    this.clearReconnectTimer();
    if (this.audioTrack) {
      // Detach from the vendor's internal attachment set (not just the DOM
      // node), then remove the element(s) attach() created — clean across reconnects.
      for (const el of this.audioTrack.detach()) el.remove();
      this.audioTrack = null;
    }
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
  }
}
