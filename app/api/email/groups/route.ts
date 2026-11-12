import { type NextRequest } from "next/server";

import { groupType, handle, str } from "@/lib/contacts-api";
import { createGroup, deleteGroup, listGroups, renameGroup } from "@/lib/contacts-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Categories & tags of the email database. */
export async function GET(request: NextRequest) {
  const counts = request.nextUrl.searchParams.get("counts") !== "0";
  return handle(request, async () => ({ groups: await listGroups(counts) }));
}

export async function POST(request: NextRequest) {
  return handle(request, async (b) => ({ group: await createGroup(groupType(b.type), str(b.name, "Nama", 80)) }));
}

export async function PATCH(request: NextRequest) {
  return handle(request, async (b) => {
    await renameGroup(str(b.id, "ID"), groupType(b.type), str(b.name, "Nama", 80));
    return {};
  });
}

export async function DELETE(request: NextRequest) {
  return handle(request, async () => {
    await deleteGroup(str(request.nextUrl.searchParams.get("id"), "ID"));
    return {};
  });
}
