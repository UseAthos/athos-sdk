# CLAUDE.md — `@useathos/sdk`

Agent guide for this repo. Read it before changing anything; it's short.

## What this is

`@useathos/sdk` — the **public, semver-stable** headless **browser** SDK customers use to run Athos AI
roleplay calls. Published to npm from this repo (`github.com/UseAthos/athos-sdk`). The package is
**at the repo root** (`package.json` / `src` / `dist`); the developer-docs site (Fumadocs) lives in
`docs/` as a separate app with its own `package.json` + lockfile, deployed to `docs.useathos.ai`
(**not** a workspace — install/build it separately).

The SDK deliberately **hides the voice transport** behind one entry point —
`AthosRoleplay.create({ token, drillKey })` → `session.connect()`. The transport rides on the
`livekit-client` dependency, which is intentionally **not bundled** and **not surfaced** in the public
API, docs, types, or error messages. Keep it that way.

## Layout

- `src/index.ts` — the **entire public surface**; everything customers can import.
- `src/types.ts` — the semver-protected contract: `ATHOS_DRILL_KEYS`, error codes, the event map.
- `src/session.ts`, `src/state-machine.ts`, `src/transport/`, … — internals.
- `tests/` — vitest (node env, no DOM). `tests/public-surface.test.ts` guards `index.ts`.
- `example/` — a Vite browser harness (`npm run example`).
- `docs/` — the Fumadocs docs site (own `npm install`, own deploy).
- `.github/workflows/` — `ci.yml` + `release.yml`.

## Stack & commands

TypeScript 5 (`strict`) · build with **tsup** (ESM `.mjs` + CJS `.cjs` + `.d.ts`, ES2020) · test with
**vitest** (node env).

```bash
npm install
npm run build      # tsup → dist/{index.mjs,index.cjs,index.d.ts}
npm run typecheck  # tsc --noEmit (source of truth for types)
npm run test       # vitest run (currently 35 tests)
npm run example    # Vite harness in example/
```

Only `dist/` ships to npm (`files: ["dist"]`); `livekit-client` is the sole runtime dependency.

## CI — `.github/workflows/`

- **`ci.yml`** — on every push to `main` and every PR: `npm ci` → `build` → `typecheck` → `test`.
  Keep it green; it's the gate for merges.
- **`release.yml`** — on a `v*` **tag** push: `build` → `test` → `npm publish`. Publishing is
  **tokenless via OIDC trusted publishing** and emits a **signed provenance** badge
  (`publishConfig.provenance: true`). The npm trusted-publisher config must match: provider
  *GitHub Actions*, repo `UseAthos/athos-sdk`, workflow `release.yml`, environment `npm-publish`.

## How to cut a release ← the important part

1. Land your change on `main` with `build` + `typecheck` + `test` green. If you touched the public
   surface, update `tests/public-surface.test.ts` deliberately and the `docs/` to match.
2. Bump the version per **semver** — this is a public customer SDK, so a breaking change to the public
   API/contract is a **major**. The clean path also creates the tag:
   ```bash
   npm version patch        # or `minor` / `major` — bumps package.json, commits, tags vX.Y.Z
   git push origin main --follow-tags
   ```
   (Manual equivalent: edit `version`, commit, then `git tag vX.Y.Z && git push origin vX.Y.Z`.)
3. The tag push fires `release.yml`, which builds, tests, and publishes `@useathos/sdk@X.Y.Z` with
   provenance. Verify on <https://www.npmjs.com/package/@useathos/sdk>.

**Do not `npm publish` from your machine.** The only manual publish was the one-time `0.2.0` bootstrap
(unsigned, just to create the package so the trusted publisher could be attached). Every release since
is CI-only and signed.

## Public-contract discipline

- `src/index.ts` + `tests/public-surface.test.ts` define and guard the public API — change them
  together, on purpose.
- **Drill-key parity is a cross-repo discipline.** `ATHOS_DRILL_KEYS` here must match the Athos
  server's launch drill set. If the launch drills change, change **both** sides.
- Any change to a request/response shape, error code, event, or drill key is a public-contract change
  → bump semver appropriately and update `docs/` (including `docs/public/openapi.yaml`) in the same PR.

## Don't

- Don't bundle `livekit-client`; don't name the voice transport in docs / public API / error strings.
- Don't publish locally — tag → CI.
- Don't commit secrets. Provenance comes from CI/OIDC, never a checked-in token.
