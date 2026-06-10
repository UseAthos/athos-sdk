// The drill catalog is public, semver-protected surface (D-44/D-56). The
// monorepo's __tests__/external/contract.test.ts guards SDK↔server sync; this
// guards the package's own export.
import { describe, it, expect } from "vitest";
import { ATHOS_DRILL_KEYS, ATHOS_ERROR_CODES } from "../src/index";

describe("public surface", () => {
  it("exports the drill catalog as a non-empty runtime list", () => {
    expect(ATHOS_DRILL_KEYS.length).toBeGreaterThan(0);
    expect(ATHOS_DRILL_KEYS).toContain("ma-full-sale");
    // Append-only contract: keys are kebab-case, never renamed.
    for (const key of ATHOS_DRILL_KEYS) {
      expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("error codes remain exported alongside the catalog", () => {
    expect(ATHOS_ERROR_CODES).toContain("DRILL_NOT_FOUND");
  });
});
