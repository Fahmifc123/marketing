import { type NextRequest } from "next/server";

import { BadInput, handle, idList, rows, str } from "@/lib/contacts-api";
import { buildSendList } from "@/lib/contacts-server";
import { countSegmentRecipients } from "@/lib/resend-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Prepares the recipients of one broadcast: chosen categories/tags ∪ CSV ∪
 * typed addresses, as a hidden send segment. The broadcast itself still goes
 * through /api/email/broadcast (test send + typed count confirmation).
 */
export async function POST(request: NextRequest) {
  return handle(request, async (b) => {
    const groupIds = idList(b.groupIds);
    const list = rows(b.rows);
    if (!groupIds.length && !list.length) throw new BadInput("Pilih kategori/tag, upload CSV, atau ketik email penerima.");
    return buildSendList({ label: str(b.label, "Label", 80, false) || "Email", groupIds, rows: list, saveToGroupIds: idList(b.saveToGroupIds) });
  });
}

/** Subscribed recipients of a prepared send list (after its import finished). */
export async function GET(request: NextRequest) {
  return handle(request, async () => countSegmentRecipients(str(request.nextUrl.searchParams.get("segmentId"), "ID")));
}
