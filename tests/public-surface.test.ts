// The drill catalog is public, semver-protected surface (D-44/D-56). SDK↔server
// parity is a MANUAL cross-repo discipline (D-03): the product repo pins its own
// list in __tests__/external/contract.test.ts, and this guards the package's
// own export. A drill change is a paired PR across both repos.
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { ATHOS_DRILL_KEYS, ATHOS_ERROR_CODES, ATHOS_EVENT_NAMES } from "../src/index";

describe("public surface", () => {
  it("exports the drill catalog as a non-empty runtime list", () => {
    expect(ATHOS_DRILL_KEYS.length).toBeGreaterThan(0);
    // Append-only contract: keys are kebab-case, never renamed.
    for (const key of ATHOS_DRILL_KEYS) {
      expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("pins the launch drill catalog exactly", () => {
    // EXACT, not `toContain`: a bogus extra key would satisfy per-key assertions
    // while a picker built from this list offers a drill the server rejects with
    // DRILL_NOT_FOUND. The server half of this pair lives in the product repo's
    // lib/external/drill-key-map.ts and pins the same sorted literal in its own
    // contract test; keep them in sync in one paired PR (D-03). Append-only: a
    // key may be added here (and to this assertion), never removed.
    expect([...ATHOS_DRILL_KEYS].sort()).toEqual(["fe-full-sale", "ma-full-sale"]);
  });

  it("freezes the exported catalog", () => {
    // Shared array instance: an unfrozen export lets one consumer's `.pop()`
    // break the picker for every other module in the process.
    expect(Object.isFrozen(ATHOS_DRILL_KEYS)).toBe(true);
  });

  // The error taxonomy and the event map are the same kind of surface as the
  // drill catalog: a picker/switch built from either must match what the server
  // and the SDK actually emit. EXACT pins, for the same reason as the drills —
  // `toContain` lets an extra or misspelt member ship unnoticed. Append-only:
  // add a member here when you add it to src/types.ts, never remove one.
  const SDK_RUNTIME_CODES = [
    "AUDIO_PLAYBACK_BLOCKED",
    "BROWSER_NOT_SUPPORTED",
    "MIC_DEVICE_DISCONNECTED",
    "MIC_PERMISSION_DENIED",
    "NETWORK_LOST",
    "NO_MIC_AVAILABLE",
    "SESSION_ALREADY_CONNECTED",
  ];
  const HTTP_CODES = [
    "AGENCY_NOT_FOUND",
    "AGENT_ALREADY_EXISTS",
    "AGENT_NOT_FOUND",
    "API_KEY_REVOKED",
    "CALL_NOT_FOUND",
    "DRILL_NOT_FOUND",
    "INTERNAL_ERROR",
    "INVALID_API_KEY",
    "INVALID_REQUEST",
    "INVALID_TOKEN",
    "IP_NOT_ALLOWED",
    "SERVICE_UNAVAILABLE",
    "TENANT_INACTIVE",
    "TENANT_QUOTA_EXCEEDED",
    "TOKEN_ALREADY_USED",
    "TOKEN_EXPIRED",
  ];

  it("pins the error taxonomy exactly (SDK runtime codes + HTTP codes)", () => {
    expect([...ATHOS_ERROR_CODES].sort()).toEqual(
      [...SDK_RUNTIME_CODES, ...HTTP_CODES].sort(),
    );
    expect(new Set(ATHOS_ERROR_CODES).size).toBe(ATHOS_ERROR_CODES.length);
  });

  it("the HTTP subset is exactly the OpenAPI `ErrorCode` enum in docs/public/openapi.yaml", () => {
    // The spec ships beside the docs and generated clients type against it, so
    // the SDK's taxonomy and the spec's enum must not drift. Read the enum out
    // of the YAML by shape (no YAML parser in devDependencies): the block under
    // `ErrorCode:` up to the next top-level schema, then its `- CODE` entries.
    const yaml = readFileSync(new URL("../docs/public/openapi.yaml", import.meta.url), "utf8");
    const block = /\n {4}ErrorCode:\n([\s\S]*?)\n {4}\S/.exec(yaml)?.[1];
    if (!block) throw new Error("ErrorCode schema not found in openapi.yaml — update this test");
    const specCodes = [...block.matchAll(/^ {8}- ([A-Z_]+)$/gm)].map((m) => m[1]).sort();
    expect(specCodes).toEqual(HTTP_CODES);
  });

  it("pins the event map exactly, in emission order", () => {
    expect(ATHOS_EVENT_NAMES).toEqual([
      "connecting",
      "ready",
      "personaSpeaking",
      "userSpeaking",
      "reconnecting",
      "reconnected",
      "ended",
      "error",
    ]);
  });
});
