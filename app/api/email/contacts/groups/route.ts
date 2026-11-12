import { type NextRequest } from "next/server";

import { BadInput, handle, str } from "@/lib/contacts-api";
import { readDb } from "@/lib/contact-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Category/tag ids of one contact. */
export async function GET(request: NextRequest) {
  return handle(request, async () => {
    const id = str(request.nextUrl.searchParams.get("id"), "ID");
    const c = (await readDb()).contacts.find((x) => x.id === id);
    if (!c) throw new BadInput("Kontak tidak ditemukan.");
    return { groupIds: c.groups };
  });
}
