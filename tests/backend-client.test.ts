import { describe, it, expect, vi, afterEach } from "vitest";
import { redeemSession } from "../src/backend-client";
import { AthosRoleplayError } from "../src/errors";

type FetchImpl = (...args: unknown[]) => Promise<unknown>;
function stubFetch(impl: FetchImpl): void {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const OK_BODY = {
  connectionTicket: "ticket",
  connectionUrl: "wss://opaque",
  sessionId: "sess_1",
  callId: "call_1",
  persona: { name: "Margaret" },
};

describe("redeemSession", () => {
  it("returns the redeem result on success", async () => {
    stubFetch(async () => ({ ok: true, json: async () => OK_BODY }));
    const result = await redeemSession("jwt", { drillKey: "ma-full-sale" });
    expect(result.callId).toBe("call_1");
    expect(result.persona.name).toBe("Margaret");
  });

  it("sends a Bearer token to the roleplay session endpoint", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => OK_BODY }));
    vi.stubGlobal("fetch", fetchMock);
    await redeemSession("jwt-123", { drillKey: "ma-full-sale" }, "http://localhost:3000");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3000/api/external/v1/roleplay/session");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer jwt-123",
    );
  });

  it("maps the error envelope code → AthosRoleplayError (passthrough)", async () => {
    for (const code of [
      "INVALID_TOKEN",
      "TOKEN_EXPIRED",
      "TOKEN_ALREADY_USED",
      "TENANT_INACTIVE",
      "TENANT_QUOTA_EXCEEDED",
      "INVALID_REQUEST",
      "DRILL_NOT_FOUND",
    ]) {
      stubFetch(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: { code, message: `denied: ${code}` } }),
      }));
      await expect(
        redeemSession("jwt", { drillKey: "ma-full-sale" }),
      ).rejects.toMatchObject({ code, message: `denied: ${code}` });
    }
  });

  it("falls back to INTERNAL_ERROR for a non-JSON error body", async () => {
    stubFetch(async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    }));
    const err = await redeemSession("jwt", { drillKey: "ma-full-sale" }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(AthosRoleplayError);
    expect(err.code).toBe("INTERNAL_ERROR");
  });
});
