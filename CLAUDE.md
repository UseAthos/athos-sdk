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
- `docs/` — the Fumadocs docs site (own `npm install`, own deploy). The whole site sits behind a
  shared password: `docs/src/proxy.ts` gates every request, `docs/src/lib/auth/` holds the helpers,
  and `docs/tests/` covers them (`npm test` inside `docs/`). It's driven by `DOCS_PASSWORD` +
  `DOCS_AUTH_SECRET` (≥ 32 chars) on the host — unset locally the site runs open, unset or weak in
  production it fails closed with a 503. Never put a real password in `docs/.env.example`; use
  `docs/.env.local`. Login-attempt rate limiting is **not** in the code — it belongs in the host's
  firewall on `POST /api/auth/login`.
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
- **`release.yml`** — on every push to `main`: `npm ci` → `build` → `test` → decide the bump → bump,
  tag, push, `npm publish`. Publishing is **tokenless via OIDC trusted publishing** and emits a
  **signed provenance** badge (`publishConfig.provenance: true`). The npm trusted-publisher config
  must match: provider *GitHub Actions*, repo `UseAthos/athos-sdk`, workflow `release.yml`,
  environment `npm-publish` — so the publish step has to stay in *this* file, under *that*
  environment. Renaming either breaks publishing.

## How to cut a release ← the important part

**You don't — merging to `main` is the release.** `release.yml` runs on every push to `main`, and the
Conventional Commit prefixes since the last `v*` tag decide what happens:

| Commits since the last tag | Result |
| --- | --- |
| any `type!:` prefix, or a `BREAKING CHANGE:` footer | **major** — a break to the public contract is a major, 0.x or not |
| `feat:` | **minor** |
| `fix:` / `perf:` / `refactor:` | **patch** |
| only `docs:` / `chore:` / `ci:` / `test:` / `build:` / `style:` | **no release** — the job stops, green |

So the whole job is writing an honest commit message. When a release is due, the workflow runs
`npm version <bump>` itself, pushes the version commit and the `vX.Y.Z` tag back to `main`, and
publishes. (That push uses `GITHUB_TOKEN`, which by design cannot start another workflow run, so it
cannot loop.) `build` and `test` run before any of it, so a broken merge can neither ship nor move
the version.

**Nobody runs `npm version` or pushes a tag by hand.** A hand-bumped version that nobody remembered
to tag is exactly the drift this replaced. If `package.json` is ever ahead of npm anyway, the next
merge publishes that version as-is — no bump — and tags it; normal bumping resumes after that.

If you touched the public surface, still update `tests/public-surface.test.ts` and `docs/` in the
same PR, and pick your prefix knowing it sets the version customers get.

**Do not `npm publish` from your machine.** The only manual publish was the one-time `0.2.0` bootstrap
(unsigned, just to create the package so the trusted publisher could be attached). Every release since
is CI-only and signed.

## Public-contract discipline

- `src/index.ts` + `tests/public-surface.test.ts` define and guard the public API — change them
  together, on purpose.
- **Drill-key parity is a cross-repo discipline.** `ATHOS_DRILL_KEYS` here must match the Athos
  server's launch drill set (`lib/external/drill-key-map.ts` in the product repo). If the launch
  drills change, change **both** sides in one paired PR. Each side pins its own sorted literal list
  in a test — `tests/public-surface.test.ts` here — so the pin must be **exact**, not "contains":
  an extra key would ship a picker offering a drill the server rejects with `DRILL_NOT_FOUND`.
- **`src/types.ts` doc comments ARE shipped API docs.** tsup copies them verbatim into
  `dist/index.d.ts`, so customers read them on editor hover. Keep them customer-facing: no internal
  decision IDs (`D-xx`), no slice numbers, no product-repo paths, no internal constant names, no
  vendor nouns. Internal rationale belongs here or in `tests/`, never in a published doc comment.
- Any change to a request/response shape, error code, event, or drill key is a public-contract change
  → bump semver appropriately and update `docs/` (including `docs/public/openapi.yaml`) in the same PR.

## Don't

- Don't bundle `livekit-client`; don't name the voice transport in docs / public API / error strings.
- Don't publish locally, and don't bump or tag by hand — merge to `main` → CI does both.
- Don't commit secrets. Provenance comes from CI/OIDC, never a checked-in token.
