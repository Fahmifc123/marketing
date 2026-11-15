import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { sanitize } from "@/lib/mayar-server";
import { byProduct, dailySeries, monthKey, monthlySeries, totals, type SaleRow } from "@/lib/sales";

const row = (p: Partial<SaleRow>): SaleRow => ({ id: Math.random().toString(36), createdAt: 0, product: "A", type: "course", method: "QRIS", status: "settled", gross: 0, fee: 0, net: 0, firstName: "", ...p });

describe("sanitize", () => {
  it("keeps only first name and computes net, dropping contact data", () => {
    const r = sanitize({
      id: "x",
      createdAt: 1,
      amount: 100000,
      status: "settled",
      fee: [{ debit: 4000 }, { debit: 700 }],
      paymentLink: { name: "Bootcamp" },
      customer: { name: "budi SANTOSO", email: "b@x.com", mobile: "0812" } as never,
    } as never);
    expect(r).toMatchObject({ gross: 100000, fee: 4700, net: 95300, firstName: "Budi", product: "Bootcamp" });
    expect(JSON.stringify(r)).not.toMatch(/b@x.com|0812|SANTOSO/);
  });
});

describe("aggregation", () => {
  // 2026-11-01 00:30 WIB = 2026-10-31 17:30 UTC — must count in November (Jakarta).
  const nov1Jkt = Date.UTC(2026, 9, 31, 17, 30);
  const rows = [
    row({ createdAt: nov1Jkt, gross: 100000, fee: 5000, net: 95000, product: "A" }),
    row({ createdAt: nov1Jkt, gross: 0, product: "Webinar" }),
    row({ createdAt: Date.UTC(2026, 9, 10), gross: 50000, fee: 2000, net: 48000, product: "B" }),
  ];
  it("uses Jakarta time for months", () => {
    expect(monthKey(nov1Jkt)).toBe("2026-11");
  });
  it("totals paid vs free", () => {
    expect(totals(rows)).toEqual({ gross: 150000, fee: 7000, net: 143000, paid: 2, free: 1 });
  });
  it("zero-fills daily and monthly series", () => {
    const now = Date.UTC(2026, 10, 2, 5);
    const d = dailySeries(rows, 3, now);
    expect(d.map((x) => [x.key, x.net])).toEqual([
      ["2026-10-31", 0],
      ["2026-11-01", 95000],
      ["2026-11-02", 0],
    ]);
    const m = monthlySeries(rows, 2, now);
    expect(m).toEqual([
      { key: "2026-10", net: 48000, paid: 1 },
      { key: "2026-11", net: 95000, paid: 1 },
    ]);
  });
  it("groups by product, highest net first", () => {
    expect(byProduct(rows).map((p) => p.product)).toEqual(["A", "B", "Webinar"]);
  });
});

describe("sync window", () => {
  it("starts at 00:00 WIB on the 1st of the previous month", async () => {
    const { syncWindowStart } = await import("@/lib/sales");
    // 15 Nov 2026 → 1 Oct 2026 00:00 WIB = 30 Sep 17:00 UTC
    expect(new Date(syncWindowStart(Date.UTC(2026, 10, 15, 6))).toISOString()).toBe("2026-09-30T17:00:00.000Z");
    // 10 Jan 2027 → 1 Dec 2026 00:00 WIB
    expect(new Date(syncWindowStart(Date.UTC(2027, 0, 10))).toISOString()).toBe("2026-11-30T17:00:00.000Z");
  });
});
