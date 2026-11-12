import { type NextRequest } from "next/server";

import { BadInput, handle, idList, rows } from "@/lib/contacts-api";
import { importContacts } from "@/lib/contact-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Saves CSV contacts (with optional kategori/tag columns) into our database. */
export async function POST(request: NextRequest) {
  return handle(request, async (b) => {
    const list = rows(b.rows);
    if (!list.length) throw new BadInput("Tidak ada email yang valid.");
    return importContacts(list, idList(b.groupIds), "csv");
  });
}
