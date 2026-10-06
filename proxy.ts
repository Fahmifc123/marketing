import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/**
 * Optimistic access check: unauthenticated visitors are sent to the access
 * screen before any workspace page renders. Pages and API routes still verify
 * the session themselves.
 */
export async function proxy(request: NextRequest) {
  const valid = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!valid) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
