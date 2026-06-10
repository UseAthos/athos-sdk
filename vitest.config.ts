import { defineConfig } from "vitest/config";

// Node env, no browser (T703): the unit tests target the pure units — state
// machine, error translation, browser detection, and the backend client (with a
// mocked fetch). No LiveKit, no DOM.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
