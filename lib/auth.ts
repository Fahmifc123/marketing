/**
 * Access-code authentication and signed session cookies.
 *
 * - The access code lives only in the MARKETING_ACCESS_CODE env variable and is
 *   compared server-side in constant time.
 * - Sessions are stateless HMAC-signed tokens in an HTTP-only cookie.
 * - The signing key is derived from SESSION_SECRET (if set) and the access
 *   code, so changing the access code invalidates every existing session.
 *
 * Uses Web Crypto so it works in route handlers, server components and proxy.
 */
import "server-only";

import { cookies } from "next/headers";

export const SESSION_COOKIE = "imk_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

const encoder = new TextEncoder();

function getAccessCode(): string | null {
  const code = process.env.MARKETING_ACCESS_CODE;
  return code && code.trim().length > 0 ? code : null;
}

export function isAccessCodeConfigured(): boolean {
  return getAccessCode() !== null;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(value: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function safeStringEqual(a: string, b: string): boolean {
  return constantTimeEqual(encoder.encode(a), encoder.encode(b));
}

/** Compares the submitted code with MARKETING_ACCESS_CODE in constant time. */
export async function verifyAccessCode(submitted: string): Promise<boolean> {
  const expected = getAccessCode();
  if (!expected || typeof submitted !== "string" || submitted.length === 0) return false;
  const [a, b] = await Promise.all([sha256(submitted), sha256(expected)]);
  return constantTimeEqual(a, b);
}

async function getSigningKey(): Promise<CryptoKey | null> {
  const code = getAccessCode();
  if (!code) return null;
  const secret = `${process.env.SESSION_SECRET ?? ""}::intelligo-marketing-kit::${code}`;
  return crypto.subtle.importKey("raw", await sha256(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function sign(payload: string, key: CryptoKey): Promise<string> {
  return toBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

/** Creates a signed session token: `<expiresAt>.<nonce>.<signature>`. */
export async function createSessionToken(now = Date.now()): Promise<string> {
  const key = await getSigningKey();
  if (!key) throw new Error("MARKETING_ACCESS_CODE is not configured");
  const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `${expiresAt}.${nonce}`;
  return `${payload}.${await sign(payload, key)}`;
}

export async function verifySessionToken(token: string | undefined | null, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [exp, nonce, signature] = parts;
  const expiresAt = Number(exp);
  if (!Number.isInteger(expiresAt) || expiresAt * 1000 <= now) return false;
  const key = await getSigningKey();
  if (!key) return false;
  const expected = await sign(`${exp}.${nonce}`, key);
  return safeStringEqual(expected, signature);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/** Reads and verifies the session cookie inside server components. */
export async function hasValidSession(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** Rejects cross-site state-changing requests (defense in depth on top of SameSite cookies). */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin fetches from older browsers / non-browser clients
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Best-effort, per-instance login throttle. Serverless instances do not share
 * memory, so this only slows down brute-force attempts.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

export function checkLoginRateLimit(ip: string, now = Date.now()): boolean {
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    if (attempts.size > 5000) attempts.clear();
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_ATTEMPTS;
}

export function resetLoginRateLimit(ip: string) {
  attempts.delete(ip);
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
