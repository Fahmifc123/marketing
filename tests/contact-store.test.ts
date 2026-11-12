import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mem: { body: string | null; etag: number } = { body: null, etag: 0 };
vi.mock("@vercel/blob", () => {
  class BlobPreconditionFailedError extends Error {}
  return {
    BlobPreconditionFailedError,
    get: async () => (mem.body === null ? null : { stream: new Blob([mem.body]).stream(), blob: { etag: String(mem.etag) } }),
    put: async (_p: string, body: string, o: { ifMatch?: string }) => {
      if (o.ifMatch && o.ifMatch !== String(mem.etag)) throw new BlobPreconditionFailedError();
      mem.body = body;
      mem.etag++;
    },
  };
});

import * as store from "@/lib/contact-store";

beforeEach(() => {
  mem.body = null;
  mem.etag = 0;
  vi.stubEnv("DATA_BLOB_READ_WRITE_TOKEN", "x");
});

describe("contact store", () => {
  it("imports with kategori/tag columns, dedupes, and resolves recipients", async () => {
    const r = await store.importContacts(
      [
        { email: "A@x.com", firstName: "Ann", categories: ["Magang"], tags: ["Pelanggan Mayar"] },
        { email: "b@x.com", categories: ["Peserta Kelas"] },
        { email: "a@x.com", categories: ["Peserta Kelas"] },
      ],
      [],
      "csv",
    );
    expect(r).toMatchObject({ created: 2, updated: 1, total: 2 });
    const db = await store.readDb();
    const groups = store.groupsWithCounts(db);
    expect(groups.map((g) => `${g.type}:${g.name}:${g.recipients}`)).toEqual(["category:Magang:1", "category:Peserta Kelas:2", "tag:Pelanggan Mayar:1"]);
    const kelas = groups.find((g) => g.name === "Peserta Kelas")!.id;
    expect(store.resolveRecipients(db, [kelas], [{ email: "c@x.com" }]).map((x) => x.email)).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
  });

  it("never sends to unsubscribed people, even when typed again", async () => {
    await store.importContacts([{ email: "a@x.com", categories: ["K"] }], [], "csv");
    await store.markUnsubscribed("a@x.com");
    await store.importContacts([{ email: "a@x.com" }], [], "csv");
    const db = await store.readDb();
    const k = db.groups[0].id;
    expect(store.resolveRecipients(db, [k], [{ email: "a@x.com" }])).toEqual([]);
  });

  it("deleting a group keeps the contacts", async () => {
    await store.importContacts([{ email: "a@x.com", tags: ["T"] }], [], "csv");
    const id = (await store.readDb()).groups[0].id;
    await store.deleteGroup(id);
    const db = await store.readDb();
    expect(db.groups).toEqual([]);
    expect(db.contacts[0].groups).toEqual([]);
  });

  it("explains when storage is not connected", async () => {
    vi.stubEnv("DATA_BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("DATA_STORE_ID", "");
    await expect(store.readDb()).rejects.toBeInstanceOf(store.StoreConfigError);
  });
});
