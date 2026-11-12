import { NextResponse, type NextRequest } from "next/server";

import { errorResponse, guardRequest } from "@/lib/api";
import { BadInput, idList, rows } from "@/lib/contacts-api";
import { importContacts, readDb, resolveRecipients, StoreConfigError } from "@/lib/contact-store";
import { AssetValidationError, parseEmailDesign } from "@/lib/email-assets";
import { EmailValidationError, normalizeCtaUrl, parseEmailDraft } from "@/lib/email-content";
import { resendErrorMessage, sendToRecipients, verifyTestToken } from "@/lib/resend-server";
import { unsubscribeUrl } from "@/lib/unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sends the email to the chosen categories/tags ∪ CSV ∪ typed addresses from
 * our own database. Irreversible, so it requires a valid test-send token for
 * this exact content and the typed recipient count to match a server recount.
 */
export async function POST(request: NextRequest) {
  const denied = await guardRequest(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_request", "Request tidak valid.");
  }

  let draft, ctaUrl: string, design, groupIds: string[], extra, saveTo: string[];
  try {
    draft = parseEmailDraft(body.draft);
    ctaUrl = normalizeCtaUrl(body.ctaUrl);
    design = parseEmailDesign(body.template, body.assets);
    groupIds = idList(body.groupIds);
    extra = rows(body.rows);
    saveTo = idList(body.saveToGroupIds);
  } catch (err) {
    const known = err instanceof EmailValidationError || err instanceof AssetValidationError || err instanceof BadInput;
    return errorResponse(400, "invalid_request", known ? (err as Error).message : "Request tidak valid.");
  }
  if (!groupIds.length && !extra.length) return errorResponse(400, "invalid_request", "Pilih penerima dulu.");

  if (!(await verifyTestToken(body.testToken, draft, ctaUrl, design))) {
    return errorResponse(409, "test_required", "Kirim email tes untuk versi terakhir ini dulu sebelum broadcast.");
  }

  try {
    // CSV / typed addresses are kept in the database first (so unsubscribes stick).
    if (extra.length) await importContacts(extra, saveTo, "broadcast");
    const recipients = resolveRecipients(await readDb(), groupIds, extra).map((r) => r.email);
    if (recipients.length === 0) return errorResponse(400, "empty_audience", "Tidak ada penerima aktif di pilihan ini.");
    if (Number(body.confirmRecipients) !== recipients.length) {
      return errorResponse(409, "confirm_mismatch", `Konfirmasi tidak cocok: pilihan ini sekarang punya ${recipients.length} penerima. Ketik angka itu untuk melanjutkan.`);
    }
    const origin = request.nextUrl.origin;
    const result = await sendToRecipients({ draft, ctaUrl, design, recipients, unsubscribeUrl: (e) => unsubscribeUrl(origin, e) });
    console.info("[email-broadcast] done", { sent: result.sent, failed: result.failed });
    return NextResponse.json({ ok: true, recipients: recipients.length, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof StoreConfigError) return errorResponse(503, "store_not_configured", err.message);
    console.error("[email-broadcast] failed", err instanceof Error ? err.name : "unknown");
    const { status, code, message } = resendErrorMessage(err);
    return errorResponse(status, code, message);
  }
}
