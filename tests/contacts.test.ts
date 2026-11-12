import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { groupName, isEmail, parseContactsCsv, parseEmailList, parseGroupName } from "@/lib/contacts";

describe("groups", () => {
  it("round-trips category and tag names; unprefixed = category; send lists recognised", () => {
    expect(parseGroupName(groupName("tag", " Alumni "))).toEqual({ type: "tag", name: "Alumni" });
    expect(parseGroupName(groupName("category", "Karyawan"))).toEqual({ type: "category", name: "Karyawan" });
    expect(parseGroupName("Newsletter")).toEqual({ type: "category", name: "Newsletter" });
    expect(parseGroupName("[Kirim] 2026-11-12 · Promo").type).toBe("send");
  });
});

describe("csv", () => {
  it("finds the email column by header, skips junk and duplicates", () => {
    const r = parseContactsCsv("Nama;Email\nBudi;BUDI@x.com\nSiti;siti@y.co.id\nX;not-an-email\nBudi2;budi@x.com\n");
    expect(r.rows).toEqual([
      { email: "budi@x.com", firstName: "Budi" },
      { email: "siti@y.co.id", firstName: "Siti" },
    ]);
    expect(r.invalid).toBe(1);
    expect(r.duplicates).toBe(1);
  });
  it("works without a header and with quoted cells", () => {
    const r = parseContactsCsv('"Lee, Ann",ann@z.io\nbob@z.io,Bob');
    expect(r.rows.map((x) => x.email)).toEqual(["ann@z.io"]); // column found from the first row
  });
  it("reads optional kategori / tag / sumber columns", () => {
    const r = parseContactsCsv("email,first_name,last_name,kategori,tag,sumber\na@b.co,Ann,,Magang,Mentor;Alumni,Form X");
    expect(r.rows[0]).toEqual({ email: "a@b.co", firstName: "Ann", categories: ["Magang"], tags: ["Mentor", "Alumni"], source: "Form X" });
  });
});

describe("typed list", () => {
  it("splits on commas/newlines and reports invalid ones", () => {
    const r = parseEmailList("a@b.co, c@d.id\n<e@f.com>; bad, a@b.co");
    expect(r.rows.map((x) => x.email)).toEqual(["a@b.co", "c@d.id", "e@f.com"]);
    expect(r.invalid).toEqual(["bad"]);
    expect(isEmail("x@y")).toBe(false);
  });
});
