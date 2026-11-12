import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { ValidationError, hasServerApiKey, resolveApiKey } from "@/lib/api";
import { apiKeyProblem } from "@/lib/api-key-client";

afterEach(() => vi.unstubAllEnvs());

describe("resolveApiKey", () => {
  it("prefers a typed key", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-server-aaaaaaaaaaaaaaaa");
    expect(resolveApiKey("sk-user-bbbbbbbbbbbbbbbbbb")).toBe("sk-user-bbbbbbbbbbbbbbbbbb");
  });
  it("falls back to the server key when empty", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-server-aaaaaaaaaaaaaaaa");
    expect(resolveApiKey("")).toBe("sk-server-aaaaaaaaaaaaaaaa");
    expect(resolveApiKey(null)).toBe("sk-server-aaaaaaaaaaaaaaaa");
    expect(hasServerApiKey()).toBe(true);
  });
  it("errors without any key, and rejects a malformed typed key", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(() => resolveApiKey("")).toThrow(ValidationError);
    expect(hasServerApiKey()).toBe(false);
    vi.stubEnv("OPENAI_API_KEY", "sk-server-aaaaaaaaaaaaaaaa");
    expect(() => resolveApiKey("bad")).toThrow(/tidak valid/);
  });
});

describe("apiKeyProblem", () => {
  it("allows empty only with a server key", () => {
    expect(apiKeyProblem("", true)).toBeNull();
    expect(apiKeyProblem("", false)).toMatch(/Masukkan/);
    expect(apiKeyProblem("bad", true)).toMatch(/tidak valid/);
    expect(apiKeyProblem("sk-abcdefghijklmnopqr", false)).toBeNull();
  });
});
