import { describe, it, expect } from "vitest";
import { detectBrowserSupport } from "../src/devices";

const UA = {
  chromeWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  edge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  firefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
};

describe("detectBrowserSupport (D-49)", () => {
  it("supports desktop Chrome / Edge / Firefox", () => {
    expect(detectBrowserSupport(UA.chromeWin).supported).toBe(true);
    expect(detectBrowserSupport(UA.chromeMac).supported).toBe(true);
    expect(detectBrowserSupport(UA.edge).supported).toBe(true);
    expect(detectBrowserSupport(UA.firefox).supported).toBe(true);
  });

  it("rejects desktop Safari with reason 'safari'", () => {
    const r = detectBrowserSupport(UA.safariMac);
    expect(r.supported).toBe(false);
    expect(r.reason).toBe("safari");
  });

  it("rejects mobile browsers with reason 'mobile'", () => {
    expect(detectBrowserSupport(UA.safariIos)).toEqual({
      supported: false,
      reason: "mobile",
    });
    expect(detectBrowserSupport(UA.chromeAndroid)).toEqual({
      supported: false,
      reason: "mobile",
    });
  });

  it("default-denies an empty / unknown UA (allowlist)", () => {
    const r = detectBrowserSupport("");
    expect(r.supported).toBe(false);
    expect(r.reason).toBe("unknown");
  });
});
