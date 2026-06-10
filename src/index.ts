// Public entry point for @useathos/sdk.
export { AthosRoleplay } from "./session";
export { AthosRoleplayError } from "./errors";
export { ATHOS_ERROR_CODES, ATHOS_DRILL_KEYS } from "./types";
export { ATHOS_EVENT_NAMES } from "./events";
// Browser-support helper so resellers can detect + prompt before create() (D-49).
export { detectBrowserSupport } from "./devices";
export type { BrowserSupport } from "./devices";
export type {
  AthosRoleplayCreateOptions,
  AthosRoleplaySession,
  AthosDrillKey,
  AthosEventMap,
  AthosEventName,
  AthosErrorCode,
  MicrophoneInfo,
} from "./types";
