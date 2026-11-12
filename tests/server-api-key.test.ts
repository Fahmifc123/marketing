import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { ValidationError, hasServerApiKey, resolveApiKey } from "@/lib/api";

afterEach(() => vi.unstubAllEnvs());

describe("resolveApiKey", () => {
  it("always uses the server key, ignoring anything the browser sends", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-server-aaaaaaaaaaaaaaaa");
    expect(resolveApiKey("sk-user-bbbbbbbbbbbbbbbbbb")).toBe("sk-server-aaaaaaaaaaaaaaaa");
  });
  it("falls back to the server key when empty", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-server-aaaaaaaaaaaaaaaa");
    expect(resolveApiKey("")).toBe("sk-server-aaaaaaaaaaaaaaaa");
    expect(resolveApiKey(null)).toBe("sk-server-aaaaaaaaaaaaaaaa");
    expect(hasServerApiKey()).toBe(true);
  });
  it("errors when the server has no key", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(() => resolveApiKey("sk-user-bbbbbbbbbbbbbbbbbb")).toThrow(ValidationError);
    expect(hasServerApiKey()).toBe(false);
  });
});

