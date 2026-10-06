import OpenAI from "openai";
import { describe, expect, it } from "vitest";

import { validateApiKey, ValidationError } from "@/lib/api";
import { toUserFacingError } from "@/lib/openai";

const headers = new Headers();

function apiError(status: number, body: Record<string, unknown>, message = "error") {
  return OpenAI.APIError.generate(status, { error: body }, message, headers);
}

describe("toUserFacingError", () => {
  it("maps invalid API keys without echoing the key", () => {
    const err = apiError(401, { code: "invalid_api_key" }, "Incorrect API key provided: sk-abc***xyz");
    const mapped = toUserFacingError(err);
    expect(mapped.message).toBe("API key tidak valid. Periksa kembali API key kamu.");
    expect(JSON.stringify(mapped)).not.toContain("sk-");
  });

  it("maps billing / quota errors", () => {
    expect(toUserFacingError(apiError(429, { code: "insufficient_quota" })).message).toBe(
      "Request gagal. Periksa billing API OpenAI.",
    );
    expect(toUserFacingError(apiError(400, { code: "billing_hard_limit_reached" })).code).toBe("insufficient_quota");
  });

  it("maps rate limits, unsupported models and sizes", () => {
    expect(toUserFacingError(apiError(429, { code: "rate_limit_exceeded" })).code).toBe("rate_limited");
    expect(toUserFacingError(apiError(404, { code: "model_not_found" })).code).toBe("unsupported_model");
    expect(toUserFacingError(apiError(400, { param: "size" }, "Invalid size")).code).toBe("unsupported_size");
    expect(toUserFacingError(apiError(400, { param: "image" }, "Invalid image file")).message).toBe(
      "Format gambar tidak didukung.",
    );
  });

  it("distinguishes OpenAI permission errors from proxy 403s", () => {
    expect(toUserFacingError(apiError(403, { type: "invalid_request_error" })).code).toBe("permission_denied");
    expect(toUserFacingError(OpenAI.APIError.generate(403, undefined, "Forbidden", headers)).code).toBe("network_error");
  });

  it("maps network errors and unknown errors to generic messages", () => {
    expect(toUserFacingError(new OpenAI.APIConnectionError({ message: "fail" })).code).toBe("network_error");
    expect(toUserFacingError(new Error("boom")).message).toBe("Generation gagal. Coba lagi.");
  });
});

describe("validateApiKey", () => {
  it("accepts well-formed keys and rejects others", () => {
    expect(validateApiKey("  sk-proj-abcdefghijklmnop1234  ")).toBe("sk-proj-abcdefghijklmnop1234");
    expect(() => validateApiKey("")).toThrow(ValidationError);
    expect(() => validateApiKey("not-a-key")).toThrow(ValidationError);
  });
});
