import { Emitter } from "./emitter";
import { AthosRoleplayError } from "./errors";
import { redeemSession } from "./backend-client";
import { LiveKitTransport } from "./transport/livekit-transport";
import type { Transport } from "./transport/transport";
import { SessionStateMachine } from "./state-machine";
import { createLogger, type Logger } from "./logger";
import { detectBrowserSupport } from "./devices";
import type {
  AthosEventMap,
  AthosRoleplayCreateOptions,
  AthosRoleplaySession,
  MicrophoneInfo,
} from "./types";

/**
 * A single roleplay session. Created synchronously via `AthosRoleplay.create`
 * so consumers can register handlers BEFORE any network work starts; the JWT is
 * redeemed and the session joined only on `connect()`. The full lifecycle is
 * driven by a pure state machine (`state-machine.ts`) so the double-connect
 * guard (D-55) and reconnect path (D-52) are independently testable.
 */
class AthosRoleplaySessionImpl implements AthosRoleplaySession {
  private readonly emitter = new Emitter();
  private readonly opts: AthosRoleplayCreateOptions;
  private readonly transport: Transport = new LiveKitTransport();
  private readonly machine = new SessionStateMachine();
  private readonly logger: Logger;
  private callId: string | null = null;

  constructor(opts: AthosRoleplayCreateOptions) {
    this.opts = opts;
    this.logger = createLogger(opts.debug ?? false);
  }

  on<E extends keyof AthosEventMap>(
    event: E,
    cb: (payload: AthosEventMap[E]) => void,
  ): () => void {
    return this.emitter.on(event, cb);
  }

  off<E extends keyof AthosEventMap>(
    event: E,
    cb: (payload: AthosEventMap[E]) => void,
  ): void {
    this.emitter.off(event, cb);
  }

  async connect(): Promise<void> {
    if (!this.machine.canConnect()) {
      // Double-connect / second concurrent session in one tab (D-55).
      const err = new AthosRoleplayError(
        "SESSION_ALREADY_CONNECTED",
        "connect() has already been called for this session",
      );
      this.emitter.emit("error", { code: err.code, message: err.message });
      throw err;
    }

    this.machine.apply("CONNECT");
    this.logger.log("connecting…");
    this.emitter.emit("connecting", undefined);
    try {
      const result = await redeemSession(
        this.opts.token,
        {
          drillKey: this.opts.drillKey,
          filters: this.opts.filters,
          difficulty: this.opts.difficulty,
        },
        this.opts.apiBase,
      );
      this.callId = result.callId;
      await this.transport.connect(
        {
          connectionUrl: result.connectionUrl,
          connectionTicket: result.connectionTicket,
          callId: result.callId,
          personaName: result.persona.name,
        },
        {
          onReady: (payload) => {
            this.logger.log(`ready — persona ${payload.persona.name}`);
            this.emitter.emit("ready", payload);
          },
          onEnded: (payload) => {
            this.machine.apply("ENDED");
            this.logger.log(`ended — ${payload.durationSec}s`);
            this.emitter.emit("ended", payload);
          },
          onError: (payload) => {
            this.logger.error(`error [${payload.code}] ${payload.message}`);
            this.emitter.emit("error", payload);
          },
          onReconnecting: () => {
            this.machine.apply("RECONNECTING");
            this.logger.warn("reconnecting…");
            this.emitter.emit("reconnecting", undefined);
          },
          onReconnected: () => {
            this.machine.apply("RECONNECTED");
            this.logger.log("reconnected");
            this.emitter.emit("reconnected", undefined);
          },
          onPersonaSpeaking: (payload) =>
            this.emitter.emit("personaSpeaking", payload),
          onUserSpeaking: (payload) =>
            this.emitter.emit("userSpeaking", payload),
        },
      );
      this.machine.apply("CONNECTED");
    } catch (e) {
      // Failed connect → idle so a genuine retry is allowed (no live session exists).
      this.machine.apply("CONNECT_FAILED");
      const err =
        e instanceof AthosRoleplayError
          ? e
          : new AthosRoleplayError(
              "INTERNAL_ERROR",
              e instanceof Error ? e.message : "Failed to connect",
            );
      // Deliver to BOTH consumer styles: the `error` event AND a rejected promise.
      this.emitter.emit("error", { code: err.code, message: err.message });
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.machine.apply("DISCONNECT");
    this.logger.log("disconnecting");
    await this.transport.disconnect();
  }

  listMicrophones(): Promise<MicrophoneInfo[]> {
    return this.transport.listMicrophones();
  }

  setMicrophone(deviceId: string): Promise<void> {
    return this.transport.setMicrophone(deviceId);
  }

  mute(): Promise<void> {
    return this.transport.mute();
  }

  unmute(): Promise<void> {
    return this.transport.unmute();
  }

  resumeAudio(): Promise<void> {
    return this.transport.resumeAudio();
  }
}

export { AthosRoleplaySessionImpl };

/** Public entry point — synchronous factory for a roleplay session. */
export class AthosRoleplay {
  static create(opts: AthosRoleplayCreateOptions): AthosRoleplaySession {
    // Browser gate (D-49): reject Safari / mobile synchronously, before any
    // network work. An absent `navigator` (SSR / non-browser) is unsupported too.
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    if (!detectBrowserSupport(ua).supported) {
      throw new AthosRoleplayError(
        "BROWSER_NOT_SUPPORTED",
        "This browser is not supported. Use desktop Chrome, Edge, or Firefox.",
      );
    }
    return new AthosRoleplaySessionImpl(opts);
  }
}
