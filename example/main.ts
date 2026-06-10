import {
  AthosRoleplay,
  detectBrowserSupport,
  ATHOS_ERROR_CODES,
  type AthosRoleplaySession,
} from "@useathos/sdk";

const logEl = document.getElementById("log") as HTMLPreElement;
const log = (m: string) => {
  logEl.textContent += `${m}\n`;
};

// Expose the SDK surface for the headless smoke harness / quick console checks.
(window as unknown as { AthosSDK: unknown }).AthosSDK = {
  AthosRoleplay,
  detectBrowserSupport,
  ATHOS_ERROR_CODES,
};

// Show the browser-support verdict on load (D-49).
const supportEl = document.getElementById("support") as HTMLParagraphElement;
const support = detectBrowserSupport(navigator.userAgent);
supportEl.dataset.supported = String(support.supported);
supportEl.textContent = `browser support: ${support.supported ? "supported" : `unsupported (${support.reason})`}`;

let session: AthosRoleplaySession | null = null;

document.getElementById("connect")!.addEventListener("click", () => {
  const token = (document.getElementById("token") as HTMLInputElement).value.trim();
  const drillKey = (document.getElementById("drill") as HTMLInputElement).value.trim();
  if (!token) {
    log("paste a token first (run scripts/smoke-external-session.ts)");
    return;
  }

  // create() is synchronous — register handlers BEFORE connect() (D-05). It also
  // throws BROWSER_NOT_SUPPORTED synchronously on Safari / mobile (D-49).
  try {
    session = AthosRoleplay.create({
      token,
      drillKey,
      apiBase: "http://localhost:3000",
      debug: true,
    });
  } catch (e) {
    log(`create() threw: ${String(e)}`);
    return;
  }

  session.on("connecting", () => log("connecting…"));
  session.on("ready", (p) => log(`ready — persona: ${p.persona.name}`));
  session.on("personaSpeaking", (p) => log(`persona speaking: ${p.speaking}`));
  session.on("userSpeaking", (p) => log(`user speaking: ${p.speaking}`));
  session.on("reconnecting", () => log("reconnecting…"));
  session.on("reconnected", () => log("reconnected"));
  session.on("ended", (p) => log(`ended — callId ${p.callId} (${p.durationSec}s)`));
  session.on("error", (e) => log(`error [${e.code}] ${e.message}`));

  log("connect()…");
  session.connect().catch((e) => log(`connect threw: ${String(e)}`));
});

document.getElementById("list-mics")!.addEventListener("click", async () => {
  const target = session ?? AthosRoleplay.create({ token: "", drillKey: "ma-full-sale" });
  try {
    const mics = await target.listMicrophones();
    log(`microphones: ${JSON.stringify(mics)}`);
  } catch (e) {
    log(`listMicrophones threw: ${String(e)}`);
  }
});

document.getElementById("check-support")!.addEventListener("click", () => {
  log(`detectBrowserSupport(current): ${JSON.stringify(detectBrowserSupport(navigator.userAgent))}`);
  log(
    `detectBrowserSupport(Safari): ${JSON.stringify(
      detectBrowserSupport(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      ),
    )}`,
  );
});
