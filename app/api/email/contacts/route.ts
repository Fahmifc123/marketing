import { type NextRequest } from "next/server";

import { isEmail } from "@/lib/contacts";
import { BadInput, handle, idList, str } from "@/lib/contacts-api";
import { addContact, listContacts, removeContact, updateContact } from "@/lib/contacts-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  return handle(request, () => listContacts({ segmentId: q.get("segmentId") || undefined, after: q.get("after") || undefined }));
}

export async function POST(request: NextRequest) {
  return handle(request, async (b) => {
    const email = str(b.email, "Email", 254).toLowerCase();
    if (!isEmail(email)) throw new BadInput("Format email tidak valid.");
    return addContact({
      email,
      firstName: str(b.firstName, "Nama depan", 80, false),
      lastName: str(b.lastName, "Nama belakang", 80, false),
      groupIds: idList(b.groupIds),
    });
  });
}

export async function PATCH(request: NextRequest) {
  return handle(request, async (b) => {
    await updateContact({
      id: str(b.id, "ID"),
      firstName: b.firstName === undefined ? undefined : str(b.firstName, "Nama depan", 80, false) || null,
      lastName: b.lastName === undefined ? undefined : str(b.lastName, "Nama belakang", 80, false) || null,
      unsubscribed: typeof b.unsubscribed === "boolean" ? b.unsubscribed : undefined,
      addGroups: idList(b.addGroups),
      removeGroups: idList(b.removeGroups),
    });
    return {};
  });
}

export async function DELETE(request: NextRequest) {
  return handle(request, async () => {
    await removeContact(str(request.nextUrl.searchParams.get("id"), "ID"));
    return {};
  });
}
