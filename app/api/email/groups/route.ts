import { type NextRequest } from "next/server";

import { groupType, handle, str } from "@/lib/contacts-api";
import { createGroup, deleteGroup, groupsWithCounts, readDb, renameGroup } from "@/lib/contact-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Categories & tags (stored in our own database). */
export async function GET(request: NextRequest) {
  return handle(request, async () => ({ groups: groupsWithCounts(await readDb()) }));
}

export async function POST(request: NextRequest) {
  return handle(request, async (b) => ({ group: await createGroup(groupType(b.type), str(b.name, "Nama", 80)) }));
}

export async function PATCH(request: NextRequest) {
  return handle(request, async (b) => {
    await renameGroup(str(b.id, "ID"), str(b.name, "Nama", 80));
    return {};
  });
}

export async function DELETE(request: NextRequest) {
  return handle(request, async () => {
    await deleteGroup(str(request.nextUrl.searchParams.get("id"), "ID"));
    return {};
  });
}
