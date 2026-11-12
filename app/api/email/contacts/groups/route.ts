import { type NextRequest } from "next/server";

import { handle, str } from "@/lib/contacts-api";
import { contactGroups } from "@/lib/contacts-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Category/tag ids of one contact. */
export async function GET(request: NextRequest) {
  return handle(request, async () => ({ groupIds: await contactGroups(str(request.nextUrl.searchParams.get("id"), "ID")) }));
}
