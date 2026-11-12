import { type NextRequest } from "next/server";

import { handle, idList, str } from "@/lib/contacts-api";
import { addContact, queryContacts, readDb, removeContact, updateContact } from "@/lib/contact-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  return handle(request, async () =>
    queryContacts(await readDb(), {
      groupId: q.get("groupId") || undefined,
      search: q.get("search") || undefined,
      offset: Math.max(0, Number(q.get("offset")) || 0),
      limit: 50,
    }),
  );
}

export async function POST(request: NextRequest) {
  return handle(request, async (b) =>
    addContact({
      email: str(b.email, "Email", 254),
      firstName: str(b.firstName, "Nama depan", 80, false),
      lastName: str(b.lastName, "Nama belakang", 80, false),
      groupIds: idList(b.groupIds),
    }),
  );
}

export async function PATCH(request: NextRequest) {
  return handle(request, async (b) => {
    await updateContact({
      id: str(b.id, "ID"),
      firstName: b.firstName === undefined ? undefined : str(b.firstName, "Nama depan", 80, false),
      lastName: b.lastName === undefined ? undefined : str(b.lastName, "Nama belakang", 80, false),
      unsubscribed: typeof b.unsubscribed === "boolean" ? b.unsubscribed : undefined,
      groups: b.groups === undefined ? undefined : idList(b.groups, 200),
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
