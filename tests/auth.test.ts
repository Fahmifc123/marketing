import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import {
  SESSION_TTL_SECONDS,
  createSessionToken,
  isSameOriginRequest,
  verifyAccessCode,
  verifySessionToken,
} from "@/lib/auth";

describe("auth", () => {
  beforeEach(() => {
    vi.stubEnv("MARKETING_ACCESS_CODE", "Marketing_123");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the configured access code only", async () => {
    expect(await verifyAccessCode("Marketing_123")).toBe(true);
    expect(await verifyAccessCode("marketing_123")).toBe(false);
    expect(await verifyAccessCode("")).toBe(false);
  });

  it("rejects everything when no access code is configured", async () => {
    vi.stubEnv("MARKETING_ACCESS_CODE", "");
    expect(await verifyAccessCode("")).toBe(false);
    expect(await verifyAccessCode("anything")).toBe(false);
  });

  it("round-trips a session token", async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(token)).toBe(true);
  });

  it("rejects tampered, malformed and expired tokens", async () => {
    const token = await createSessionToken();
    const [exp, nonce, sig] = token.split(".");
    expect(await verifySessionToken(`${Number(exp) + 1000}.${nonce}.${sig}`)).toBe(false);
    expect(await verifySessionToken("garbage")).toBe(false);
    expect(await verifySessionToken(undefined)).toBe(false);
    expect(await verifySessionToken(token, Date.now() + (SESSION_TTL_SECONDS + 1) * 1000)).toBe(false);
  });

  it("invalidates sessions when the access code changes", async () => {
    const token = await createSessionToken();
    vi.stubEnv("MARKETING_ACCESS_CODE", "NewCode_456");
    expect(await verifySessionToken(token)).toBe(false);
  });

  it("rejects cross-site requests", () => {
    const req = (origin?: string) =>
      new Request("https://marketing.intelligo.id/api/generate", {
        method: "POST",
        headers: { host: "marketing.intelligo.id", ...(origin ? { origin } : {}) },
      });
    expect(isSameOriginRequest(req("https://marketing.intelligo.id"))).toBe(true);
    expect(isSameOriginRequest(req())).toBe(true);
    expect(isSameOriginRequest(req("https://evil.example"))).toBe(false);
  });
});
