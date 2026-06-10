import type { AthosEventName } from "./types";

/**
 * Canonical, ordered list of every SDK event name (the full taxonomy — D-56).
 * Exported so consumers / tests can iterate the surface exhaustively.
 */
export const ATHOS_EVENT_NAMES: readonly AthosEventName[] = [
  "connecting",
  "ready",
  "personaSpeaking",
  "userSpeaking",
  "reconnecting",
  "reconnected",
  "ended",
  "error",
];
