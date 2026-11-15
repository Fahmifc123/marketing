import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let stored: unknown = null;
vi.mock("@/lib/private-blob", () => ({
  readJson: async () => ({ value: stored, etag: stored ? "1" : null }),
  writeJson: async (_p: string, v: unknown) => {
    stored = JSON.parse(JSON.stringify(v));
  },
  isPreconditionError: () => false,
}));

import { syncSales } from "@/lib/mayar-server";
import { syncWindowStart } from "@/lib/sales";

const DAY = 86_400_000;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("syncSales", () => {
  it("stops at the 1st of last month and is idempotent", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 2000 });
    vi.setSystemTime(Date.UTC(2026, 10, 15, 6));
    vi.stubEnv("MAYAR_API_KEY", "k");
    const cutoff = syncWindowStart(Date.now());
    // 3 pages of 2 tx each, newest first; page 3 crosses the cutoff.
    const tx = (i: number, at: number) => ({ id: `t${i}`, createdAt: at, amount: 100, fee: [{ debit: 10 }], paymentLink: { name: "P" }, customer: { name: "Ann X", email: "a@x.co" } });
    const pages = [
      [tx(1, Date.now() - DAY), tx(2, Date.now() - 2 * DAY)],
      [tx(3, cutoff + 5 * DAY), tx(4, cutoff + DAY)],
      [tx(5, cutoff + 1000), tx(6, cutoff - DAY)],
    ];
    let calls = 0;
    vi.stubGlobal("fetch", async (url: URL) => {
      calls++;
      const after = url.searchParams.get("startingAfter");
      const i = after ? Number(after.slice(1)) : 0;
      return new Response(JSON.stringify({ data: pages[i], hasMore: i < 2, nextStartingAfter: `p${i + 1}` }), { status: 200 });
    });
    const r = await syncSales(60_000);
    expect(r).toMatchObject({ added: 5, complete: true, total: 5 });
    expect(calls).toBe(3);
    expect(JSON.stringify(stored)).not.toContain("a@x.co");

    calls = 0;
    const again = await syncSales(60_000);
    expect(again).toMatchObject({ added: 0, total: 5 });
    expect(calls).toBe(1); // first page hits known ids and stops
  });
});
