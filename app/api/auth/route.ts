import { NextResponse, type NextRequest } from "next/server";

import {
  SESSION_COOKIE,
  checkLoginRateLimit,
  createSessionToken,
  getClientIp,
  isAccessCodeConfigured,
  isSameOriginRequest,
  resetLoginRateLimit,
  sessionCookieOptions,
  verifyAccessCode,
} from "@/lib/auth";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Log in: validates the access code server-side and sets the session cookie. */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403, "forbidden", "Request tidak diizinkan.");
  }
  if (!isAccessCodeConfigured()) {
    console.error("[auth] MARKETING_ACCESS_CODE is not configured");
    return errorResponse(500, "not_configured", "Access code belum dikonfigurasi di server. Hubungi admin.");
  }

  const ip = getClientIp(request);
  if (!checkLoginRateLimit(ip)) {
    return errorResponse(429, "rate_limited", "Terlalu banyak percobaan. Coba lagi dalam beberapa menit.");
  }

  let accessCode: unknown;
  try {
    ({ accessCode } = await request.json());
  } catch {
    return errorResponse(400, "invalid_request", "Request tidak valid.");
  }

  if (typeof accessCode !== "string" || accessCode.length === 0 || accessCode.length > 256) {
    return errorResponse(400, "invalid_access_code", "Masukkan access code.");
  }

  if (!(await verifyAccessCode(accessCode))) {
    return errorResponse(401, "invalid_access_code", "Access code tidak valid.");
  }

  resetLoginRateLimit(ip);
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions());
  return response;
}

/** Log out: destroys the session cookie. */
export async function DELETE(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403, "forbidden", "Request tidak diizinkan.");
  }
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
