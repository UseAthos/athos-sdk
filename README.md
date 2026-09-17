# @useathos/sdk

Headless browser SDK for running **Athos AI roleplay calls** inside your own web app. It exposes a
small, domain-focused API (a roleplay session with lifecycle events) and **hides the voice transport
entirely** — your code never touches a WebRTC primitive.

- Synchronous `create()` so you can register handlers before any network work starts
- Typed, discriminated event union + a stable error-code taxonomy
- Microphone selection, mute, and automatic reconnect handling built in
- Ships as ESM + CJS with full TypeScript types

**Full integration docs — minting tokens from your backend, the signed `call.scored` webhook, and
the REST API that returns the transcript and score — are at
[docs.useathos.ai](https://docs.useathos.ai).** This README covers the browser half only.

> **Browser support:** desktop **Chromium-based browsers (Chrome, Edge, Opera, Brave, …) and Firefox**
> only. Safari (desktop and iOS) and all
> mobile browsers are unsupported — `create()` throws `BROWSER_NOT_SUPPORTED` on them. Detect ahead of
> time with the exported `detectBrowserSupport(navigator.userAgent)` and prompt the user to switch.

---

## Install

```bash
npm install @useathos/sdk
```

## Quickstart — the 5-line integration

Your backend mints a short-lived, single-use session token for a **registered** rep and hands it to
the browser. The browser never sees your Athos API key.

```bash
# backend — exactly one of platformAgentId (the id you registered the rep under) or agentId
curl -X POST https://app.useathos.ai/api/external/v1/session \
  -H "Authorization: Bearer $ATHOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"platformAgentId":"rep_8842"}'
# → { "token": "eyJhbGci…", "expiresAt": "2026-06-05T18:05:00.000Z" }
```

`getAthosToken()` below is **your** endpoint that makes that call server-side. Registering reps and
the full backend loop are covered at [docs.useathos.ai](https://docs.useathos.ai/quickstart).

```ts
import { AthosRoleplay } from "@useathos/sdk";

const token = await getAthosToken();                       // 1. your backend mints a JIT token
const session = AthosRoleplay.create({ token, drillKey: "ma-full-sale" }); // 2. create (sync)
session.on("ready", ({ persona }) => console.log(`${persona.name} is ready`)); // 3. register handlers
session.on("ended", ({ durationSec }) => console.log(`done in ${durationSec}s`));
await session.connect();                                    // 4. join the call
```

Always register handlers **before** calling `connect()` — `create()` does no network work, so nothing
is missed.

## Ending a call

**The AI persona never hangs up.** A call runs until you call `session.disconnect()`, until the
two-hour ceiling, or until the network drops — so your UI needs an "End call" button wired to
`disconnect()`. Without one, a rep who walks away leaves the call running for the full two hours,
billed and counted against your monthly allowance.

```ts
endCallButton.onclick = () => session.disconnect();
```

All three endings fire the `ended` event with the public `callId` — that is how you learn the call
is over, and the id your backend uses to look up the score.

## Drill keys

`drillKey` accepts any `string` — newly enabled drills work without upgrading the SDK, and keys
can come straight from your own config/DB. An unknown key fails server-side with `DRILL_NOT_FOUND`.
For compile-time checking and autocomplete, the available catalog is exported as an **opt-in** type
+ runtime list:

```ts
import { ATHOS_DRILL_KEYS, type AthosDrillKey } from "@useathos/sdk";

const drillKey: AthosDrillKey = "ma-full-sale"; // opt-in: typos fail to compile
ATHOS_DRILL_KEYS; // ["ma-full-sale", "fe-full-sale"]
```

Two drills are available today — `ma-full-sale` (Medicare Advantage — full enrollment) and
`fe-full-sale` (Final Expense — full sale). The catalog is append-only.

## Events

`session.on(name, cb)` returns an unsubscribe function. There is **no live transcript event** — the
transcript is delivered post-call via the Athos REST API
([reading calls](https://docs.useathos.ai/backend/reading-calls)).

| Event | Payload | Fires when |
| --- | --- | --- |
| `connecting` | — | `connect()` was called; redeeming the token / joining. |
| `ready` | `{ persona: { name } }` | The persona is ready to speak. |
| `personaSpeaking` | `{ speaking }` | The persona started/stopped speaking. |
| `userSpeaking` | `{ speaking }` | The local rep started/stopped speaking. |
| `reconnecting` | — | A transient network drop is being recovered automatically. |
| `reconnected` | — | The connection recovered. |
| `ended` | `{ callId, durationSec }` | The call ended. |
| `error` | `{ code, message }` | A domain error. Branch on `code` (below). |

## Microphone & audio controls

`connect()` asks for microphone permission **before** it redeems the session token, so a rep who
denies the prompt has not spent it — retry the same token on a new session, and mint a fresh one
only if that comes back `TOKEN_ALREADY_USED`. The page must be served over HTTPS (or `localhost`),
or the browser withholds mic access entirely.

```ts
const mics = await session.listMicrophones();      // [{ deviceId, label }]
await session.setMicrophone(mics[0].deviceId);     // switch mid-call, no drop
await session.mute();
await session.unmute();
await session.resumeAudio();                        // call from a click handler after AUDIO_PLAYBACK_BLOCKED
```

## Reconnect behavior

On a transient drop the SDK reconnects automatically and emits `reconnecting`, then `reconnected` on
recovery. If recovery does not succeed within **30 seconds**, it emits an `error` with code
`NETWORK_LOST` and ends the session.

## Error codes

Branch on `error.code` (and on a thrown `AthosRoleplayError.code`). `message` is human-readable and
**not** machine-parsable. The full list is exported as `ATHOS_ERROR_CODES`.

| Code | Meaning |
| --- | --- |
| `MIC_PERMISSION_DENIED` | The user denied microphone permission. Usually raised before the token is spent. |
| `MIC_DEVICE_DISCONNECTED` | The active microphone was unplugged, or is held by another app. |
| `NO_MIC_AVAILABLE` | No microphone is available, or the page is not served over HTTPS. |
| `NETWORK_LOST` | The connection dropped and could not be recovered within 30s. |
| `AUDIO_PLAYBACK_BLOCKED` | The browser blocked audio autoplay; call `resumeAudio()` from a user gesture. |
| `BROWSER_NOT_SUPPORTED` | Safari / mobile / unsupported browser (thrown synchronously from `create()`). |
| `SESSION_ALREADY_CONNECTED` | `connect()` was called twice on the same session — sessions are single-use; create a new one per call. |
| `INVALID_TOKEN` | The token was malformed or rejected. |
| `TOKEN_EXPIRED` | The token's short lifetime elapsed before redemption. |
| `TOKEN_ALREADY_USED` | The single-use token was already redeemed. |
| `INVALID_REQUEST` | The request body was invalid (e.g. a missing/blank `drillKey`). |
| `DRILL_NOT_FOUND` | The `drillKey` does not match a known drill. |
| `SERVICE_UNAVAILABLE` | No persona is available for the drill right now — the only 503 (an infrastructure failure is `INTERNAL_ERROR`). The attempt consumed the session token, so mint a new one and start a new call. |
| `INTERNAL_ERROR` | An unexpected error; see `message`. |

A failed redemption usually **spends** the session token — it is consumed as the request is
redeemed, so only `INVALID_TOKEN`, `TOKEN_EXPIRED` and `INVALID_REQUEST` leave it unspent. Recover
from anything else by minting a new token, not by replaying the same request.

The full shared taxonomy (`ATHOS_ERROR_CODES`) also includes codes returned to your **backend** by
the other Athos REST endpoints, never to the browser: `INVALID_API_KEY`, `API_KEY_REVOKED`,
`IP_NOT_ALLOWED`, `TENANT_INACTIVE`, `TENANT_QUOTA_EXCEEDED`, `CALL_NOT_FOUND`, `AGENT_NOT_FOUND`,
`AGENT_ALREADY_EXISTS` and `AGENCY_NOT_FOUND`. The SDK's roleplay-session call surfaces the subset
above.

```ts
import { AthosRoleplayError } from "@useathos/sdk";

session.on("error", ({ code, message }) => {
  if (code === "MIC_PERMISSION_DENIED") promptForMicAccess();
  else if (code === "AUDIO_PLAYBACK_BLOCKED") showResumeButton();
  else console.error(code, message);
});

try {
  await session.connect();
} catch (e) {
  // A caught value is `unknown` under strict TypeScript; `AthosRoleplayError` narrows it.
  if (e instanceof AthosRoleplayError) showStartFailed(e.code);
  else throw e;
}
```

## Debug logging

```ts
AthosRoleplay.create({ token, drillKey, debug: true }); // [Athos]-prefixed console logs
```

## TypeScript

Fully typed, including the discriminated event union (`AthosEventMap`) and the `AthosErrorCode` union.
Types are bundled in the package.
