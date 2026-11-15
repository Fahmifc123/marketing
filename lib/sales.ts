/**
 * Mayar sales: shared types and aggregation (browser + server).
 * Money in IDR. `net` = gross − Mayar/Xendit fees. Months/days in Asia/Jakarta.
 */

export interface SaleRow {
  id: string;
  /** epoch ms */
  createdAt: number;
  product: string;
  /** Mayar balanceHistoryType: course, payme, cohort_based, webinar, … */
  type: string;
  method: string;
  status: string;
  gross: number;
  fee: number;
  net: number;
  /** First name only — never email or phone. */
  firstName: string;
}

export interface SalesSnapshot {
  rows: SaleRow[];
  syncedAt: string | null;
  /** True once the full history has been pulled. */
  complete: boolean;
}

const JKT = "Asia/Jakarta";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: JKT, year: "numeric", month: "2-digit", day: "2-digit" });

/** "2026-11-15" in Jakarta time. */
export const dayKey = (ms: number) => dayFmt.format(new Date(ms));
export const monthKey = (ms: number) => dayKey(ms).slice(0, 7);

export const isPaid = (r: SaleRow) => r.gross > 0;

export interface Totals {
  gross: number;
  fee: number;
  net: number;
  paid: number;
  free: number;
}

export function totals(rows: SaleRow[]): Totals {
  const t: Totals = { gross: 0, fee: 0, net: 0, paid: 0, free: 0 };
  for (const r of rows) {
    t.gross += r.gross;
    t.fee += r.fee;
    t.net += r.net;
    if (isPaid(r)) t.paid++;
    else t.free++;
  }
  return t;
}

/** Net per day for the last `days` days ending today (Jakarta), zero-filled. */
export function dailySeries(rows: SaleRow[], days: number, now = Date.now()): { key: string; net: number; paid: number }[] {
  const out = new Map<string, { net: number; paid: number }>();
  for (let i = days - 1; i >= 0; i--) out.set(dayKey(now - i * 86_400_000), { net: 0, paid: 0 });
  for (const r of rows) {
    const b = out.get(dayKey(r.createdAt));
    if (b) {
      b.net += r.net;
      if (isPaid(r)) b.paid++;
    }
  }
  return [...out].map(([key, v]) => ({ key, ...v }));
}

/** Net per month for the last `months` months, zero-filled. */
export function monthlySeries(rows: SaleRow[], months: number, now = Date.now()): { key: string; net: number; paid: number }[] {
  const [y, m] = monthKey(now).split("-").map(Number);
  const out = new Map<string, { net: number; paid: number }>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.set(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, { net: 0, paid: 0 });
  }
  for (const r of rows) {
    const b = out.get(monthKey(r.createdAt));
    if (b) {
      b.net += r.net;
      if (isPaid(r)) b.paid++;
    }
  }
  return [...out].map(([key, v]) => ({ key, ...v }));
}

export function byProduct(rows: SaleRow[]): { product: string; paid: number; free: number; gross: number; net: number }[] {
  const out = new Map<string, { paid: number; free: number; gross: number; net: number }>();
  for (const r of rows) {
    const b = out.get(r.product) ?? { paid: 0, free: 0, gross: 0, net: 0 };
    if (isPaid(r)) b.paid++;
    else b.free++;
    b.gross += r.gross;
    b.net += r.net;
    out.set(r.product, b);
  }
  return [...out].map(([product, v]) => ({ product, ...v })).sort((a, b) => b.net - a.net || b.paid - a.paid);
}

export const inMonth = (rows: SaleRow[], key: string) => rows.filter((r) => monthKey(r.createdAt) === key);

export const rupiah = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");
export const rupiahShort = (n: number) =>
  n >= 1_000_000 ? `Rp${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt` : n >= 1000 ? `Rp${Math.round(n / 1000)} rb` : rupiah(n);
