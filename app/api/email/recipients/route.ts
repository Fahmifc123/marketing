import { type NextRequest } from "next/server";

import { handle, idList, rows } from "@/lib/contacts-api";
import { readDb, resolveRecipients } from "@/lib/contact-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How many subscribed people a selection reaches (deduped). */
export async function POST(request: NextRequest) {
  return handle(request, async (b) => ({ recipients: resolveRecipients(await readDb(), idList(b.groupIds), rows(b.rows)).length }));
}
