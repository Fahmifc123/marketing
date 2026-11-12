import { type NextRequest } from "next/server";

import { BadInput, handle, idList, rows, str } from "@/lib/contacts-api";
import { importContacts, importStatus } from "@/lib/contacts-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Saves CSV contacts into the database (and chosen categories/tags). */
export async function POST(request: NextRequest) {
  return handle(request, async (b) => {
    const list = rows(b.rows);
    if (!list.length) throw new BadInput("Tidak ada email yang valid.");
    return { ...(await importContacts(list, idList(b.groupIds))), total: list.length };
  });
}

export async function GET(request: NextRequest) {
  return handle(request, () => importStatus(str(request.nextUrl.searchParams.get("id"), "ID")));
}
