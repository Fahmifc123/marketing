import { NextResponse, type NextRequest } from "next/server";

import { errorResponse, guardRequest } from "@/lib/api";
import { AssetValidationError, parseEmailDesign } from "@/lib/email-assets";
import { EmailValidationError, normalizeCtaUrl, parseEmailDraft } from "@/lib/email-content";
import { countSegmentRecipients, resendErrorMessage, sendBroadcast, verifyTestToken } from "@/lib/resend-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Sends a broadcast to a Resend segment. Irreversible, so it requires:
 * 1. a valid test-send token for this exact content, and
 * 2. the recipient count typed by the marketer to match the segment (server recount).
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

  let draft;
  let ctaUrl: string;
  let design;
  try {
    draft = parseEmailDraft(body.draft);
    ctaUrl = normalizeCtaUrl(body.ctaUrl);
    design = parseEmailDesign(body.template, body.assets);
  } catch (err) {
    return errorResponse(400, "invalid_request", err instanceof EmailValidationError || err instanceof AssetValidationError ? err.message : "Request tidak valid.");
  }
  const segmentId = typeof body.segmentId === "string" ? body.segmentId.trim() : "";
  if (!segmentId) return errorResponse(400, "invalid_request", "Pilih segment penerima.");

  if (!(await verifyTestToken(body.testToken, draft, ctaUrl, design))) {
    return errorResponse(409, "test_required", "Kirim email tes untuk versi terakhir ini dulu sebelum broadcast.");
  }

  try {
    const { recipients, capped } = await countSegmentRecipients(segmentId);
    if (recipients === 0) return errorResponse(400, "empty_segment", "Segment ini tidak punya penerima aktif.");
    if (capped || Number(body.confirmRecipients) !== recipients) {
      return errorResponse(
        409,
        "confirm_mismatch",
        capped
          ? "Segment terlalu besar untuk dikonfirmasi otomatis. Kirim broadcast ini dari dashboard Resend."
          : `Konfirmasi tidak cocok: segment ini sekarang punya ${recipients} penerima. Ketik angka itu untuk melanjutkan.`,
      );
    }
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 100) : draft.subject.slice(0, 100);
    const { id } = await sendBroadcast({ draft, ctaUrl, design, segmentId, name });
    console.info("[email-broadcast] sent", { recipients });
    return NextResponse.json({ ok: true, broadcastId: id, recipients }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[email-broadcast] failed", err instanceof Error ? err.name : "unknown");
    const { status, code, message } = resendErrorMessage(err);
    return errorResponse(status, code, message);
  }
}
