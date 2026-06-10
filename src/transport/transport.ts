import type { AthosEventMap, MicrophoneInfo } from "../types";

// The transport abstraction seam. This is what keeps the voice vendor isolated:
// the session depends only on this interface, and only livekit-transport.ts
// imports the concrete client. No vendor noun appears in this file.

export interface ConnectParams {
  /** Opaque transport endpoint (from the redeem response). */
  connectionUrl: string;
  /** Opaque connection ticket (from the redeem response). */
  connectionTicket: string;
  /** Stable public call id, echoed back on `ended`. */
  callId: string;
  /** Persona display name, surfaced on `ready`. */
  personaName: string;
}

/** Callbacks the transport raises back to the session (session owns `connecting`). */
export interface TransportCallbacks {
  onReady: (payload: AthosEventMap["ready"]) => void;
  onEnded: (payload: AthosEventMap["ended"]) => void;
  onError: (payload: AthosEventMap["error"]) => void;
  onReconnecting: () => void;
  onReconnected: () => void;
  onPersonaSpeaking: (payload: AthosEventMap["personaSpeaking"]) => void;
  onUserSpeaking: (payload: AthosEventMap["userSpeaking"]) => void;
}

export interface Transport {
  connect(params: ConnectParams, callbacks: TransportCallbacks): Promise<void>;
  disconnect(): Promise<void>;
  listMicrophones(): Promise<MicrophoneInfo[]>;
  setMicrophone(deviceId: string): Promise<void>;
  mute(): Promise<void>;
  unmute(): Promise<void>;
  resumeAudio(): Promise<void>;
}
