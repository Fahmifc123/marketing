import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { errorResponse, guardRequest } from "@/lib/api";
import { isEmail, type GroupType, type ParsedRow } from "@/lib/contacts";
import { StoreConfigError, StoreInputError } from "@/lib/contact-store";
import { EmailConfigError, ResendRequestError, resendErrorMessage } from "@/lib/resend-server";

export class BadInput extends Error {}

/** Guard + JSON body + uniform error mapping for the email-database routes. */
export async function handle(request: NextRequest, fn: (body: Record<string, unknown>) => Promise<unknown>) {
  const denied = await guardRequest(request);
  if (denied) return denied;
  let body: Record<string, unknown> = {};
  if (request.method !== "GET" && request.method !== "DELETE") {
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, "invalid_request", "Request tidak valid.");
    }
  }
  try {
    const data = await fn(body);
    return NextResponse.json({ ok: true, ...(data as object) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof BadInput || err instanceof StoreInputError) return errorResponse(400, "invalid_request", err.message);
    if (err instanceof StoreConfigError) return errorResponse(503, "store_not_configured", err.message);
    console.error("[contacts] failed", request.method, request.nextUrl.pathname, (err as Error)?.name, String((err as Error)?.message).slice(0, 200));
    if (err instanceof EmailConfigError || err instanceof ResendRequestError) {
      const { status, code, message } = resendErrorMessage(err);
      return errorResponse(status, code, message);
    }
    return errorResponse(502, "store_failed", "Gagal menyimpan ke database kontak. Coba lagi.");
  }
}

export function str(v: unknown, field: string, max = 100, required = true): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (required && !s) throw new BadInput(`${field} wajib diisi.`);
  if (s.length > max) throw new BadInput(`${field} terlalu panjang.`);
  return s;
}

export function groupType(v: unknown): GroupType {
  if (v === "category" || v === "tag") return v;
  throw new BadInput("Jenis harus Kategori atau Tag.");
}

export function idList(v: unknown, max = 50): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > max || v.some((x) => typeof x !== "string" || !x || x.length > 100)) {
    throw new BadInput("Daftar kategori/tag tidak valid.");
  }
  return [...new Set(v as string[])];
}

export const MAX_ROWS = 20_000;

export function rows(v: unknown): ParsedRow[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_ROWS) throw new BadInput(`Maksimal ${MAX_ROWS} email sekali kirim.`);
  const seen = new Set<string>();
  const out: ParsedRow[] = [];
  for (const r of v as Record<string, unknown>[]) {
    const email = typeof r?.email === "string" ? r.email.trim().toLowerCase() : "";
    if (!isEmail(email)) throw new BadInput(`Email tidak valid: ${email.slice(0, 60) || "(kosong)"}`);
    if (seen.has(email)) continue;
    seen.add(email);
    const name = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim().slice(0, 80) : undefined);
    const names = (x: unknown) => (Array.isArray(x) ? x.filter((n): n is string => typeof n === "string" && Boolean(n.trim())).slice(0, 10).map((n) => n.trim().slice(0, 80)) : undefined);
    out.push({
      email,
      firstName: name(r.firstName),
      lastName: name(r.lastName),
      categories: names(r.categories),
      tags: names(r.tags),
      source: typeof r.source === "string" ? r.source.slice(0, 120) : undefined,
    });
  }
  return out;
}
