import { defineConfig } from "tsup";

// ESM (.mjs) + CJS (.cjs) + types (.d.ts), ES2020, sourcemaps published (D-46).
// `livekit-client` is a REGULAR dependency, intentionally NOT bundled into the
// dist (npm resolves it transitively so the reseller never names LiveKit; a
// bundled WebRTC client risks duplicate-instance/singleton bugs — D-56/T001).
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  target: "es2020",
  clean: true,
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
