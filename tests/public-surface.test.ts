// The drill catalog is public, semver-protected surface (D-44/D-56). SDK↔server
// parity is a MANUAL cross-repo discipline (D-03): the product repo pins its own
// list in __tests__/external/contract.test.ts, and this guards the package's
// own export. A drill change is a paired PR across both repos.
import { describe, it, expect } from "vitest";
import { ATHOS_DRILL_KEYS, ATHOS_ERROR_CODES } from "../src/index";

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

  it("error codes remain exported alongside the catalog", () => {
    expect(ATHOS_ERROR_CODES).toContain("DRILL_NOT_FOUND");
  });
});
