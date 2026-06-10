import type { AthosEventMap } from "./types";

// Internal storage erases the per-event payload type (contravariant `never` is
// the safe bottom type — avoids `any`). The public on/off/emit signatures stay
// fully type-safe; the boundary casts are the standard typed-emitter idiom.
type ErasedHandler = (payload: never) => void;

/**
 * Tiny typed event emitter backing the SDK session. Kept internal — consumers
 * only see the `on`/`off` methods re-exposed on AthosRoleplaySession.
 */
export class Emitter {
  private readonly handlers = new Map<keyof AthosEventMap, Set<ErasedHandler>>();

  on<E extends keyof AthosEventMap>(
    event: E,
    cb: (payload: AthosEventMap[E]) => void,
  ): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set<ErasedHandler>();
      this.handlers.set(event, set);
    }
    set.add(cb as ErasedHandler);
    return () => this.off(event, cb);
  }

  off<E extends keyof AthosEventMap>(
    event: E,
    cb: (payload: AthosEventMap[E]) => void,
  ): void {
    this.handlers.get(event)?.delete(cb as ErasedHandler);
  }

  emit<E extends keyof AthosEventMap>(event: E, payload: AthosEventMap[E]): void {
    this.handlers
      .get(event)
      ?.forEach((cb) => (cb as (p: AthosEventMap[E]) => void)(payload));
  }
}
