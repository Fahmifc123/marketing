/**
 * Read-only Mayar sync. Transactions are pulled from the Mayar API with the
 * server-side MAYAR_API_KEY, stripped of buyer contact data (only the first
 * name is kept), and stored in the private DATA blob store. Each sync pulls
 * new transactions first, then continues the history backfill within a time
 * budget (Mayar rate-limits at roughly 50 requests in a burst).
 */
import "server-only";

import { isPreconditionError, readJson, writeJson } from "@/lib/private-blob";
import type { SaleRow, SalesSnapshot } from "@/lib/sales";

const API = "https://api.mayar.id/hl/v2/transactions";
const PATH = "db/mayar-sales.json";
const PAGE_DELAY_MS = 1100;

export class MayarConfigError extends Error {}
export class MayarRateLimitError extends Error {}

interface StoredSales extends SalesSnapshot {
  version: 1;
  /** startingAfter cursor for the next older page; null when history is complete. */
  backfillCursor: string | null;
}

const EMPTY: StoredSales = { version: 1, rows: [], syncedAt: null, complete: false, backfillCursor: null };

function apiKey(): string {
  const k = process.env.MAYAR_API_KEY?.trim();
  if (!k) throw new MayarConfigError("MAYAR_API_KEY belum diatur di server (Vercel → Environment Variables).");
  return k;
}

interface MayarTx {
  id: string;
  createdAt: number;
  amount?: number;
  status?: string;
  paymentMethod?: string;
  balanceHistoryType?: string;
  fee?: { debit?: number }[] | null;
  paymentLink?: { name?: string } | null;
  customer?: { name?: string } | null;
}

const firstNameOf = (name: string | undefined) => {
  const w = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : "";
};

/** Keeps only what the dashboard shows — never email, phone or customer ids. */
export function sanitize(t: MayarTx): SaleRow {
  const gross = Math.max(0, Number(t.amount) || 0);
  const fee = (t.fee ?? []).reduce((s, f) => s + (Number(f.debit) || 0), 0);
  return {
    id: String(t.id),
    createdAt: Number(t.createdAt) || 0,
    product: (t.paymentLink?.name ?? "(tanpa nama produk)").slice(0, 140),
    type: String(t.balanceHistoryType ?? ""),
    method: String(t.paymentMethod ?? ""),
    status: String(t.status ?? ""),
    gross,
    fee,
    net: gross - fee,
    firstName: firstNameOf(t.customer?.name).slice(0, 40),
  };
}

async function fetchPage(startingAfter?: string): Promise<{ data: MayarTx[]; hasMore: boolean; next: string | null }> {
  const url = new URL(API);
  url.searchParams.set("limit", "50");
  if (startingAfter) url.searchParams.set("startingAfter", startingAfter);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey()}`, Accept: "application/json" }, cache: "no-store" });
  if (res.status === 429) throw new MayarRateLimitError("Mayar membatasi request. Coba lagi beberapa menit lagi.");
  if (res.status === 401 || res.status === 403) throw new MayarConfigError("MAYAR_API_KEY ditolak Mayar. Periksa key di Vercel.");
  if (!res.ok) throw new Error(`Mayar HTTP ${res.status}`);
  const body = (await res.json()) as { data?: MayarTx[]; hasMore?: boolean; nextStartingAfter?: string };
  return { data: Array.isArray(body.data) ? body.data : [], hasMore: Boolean(body.hasMore), next: body.nextStartingAfter ?? null };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function readSales(): Promise<SalesSnapshot> {
  const { value } = await readJson<StoredSales>(PATH);
  const s = value ?? EMPTY;
  return { rows: s.rows, syncedAt: s.syncedAt, complete: s.complete };
}

export interface SyncResult {
  added: number;
  backfilled: number;
  complete: boolean;
  total: number;
  rateLimited: boolean;
}

/** Pulls new transactions, then more history, within `budgetMs`. Idempotent: rows are keyed by Mayar id. */
export async function syncSales(budgetMs = 40_000): Promise<SyncResult> {
  const started = Date.now();
  const { value, etag } = await readJson<StoredSales>(PATH);
  const store: StoredSales = value ?? structuredClone(EMPTY);
  const known = new Set(store.rows.map((r) => r.id));
  let added = 0;
  let backfilled = 0;
  let rateLimited = false;
  const timeLeft = () => budgetMs - (Date.now() - started);

  try {
    // 1) New transactions: newest first until we meet a known one.
    let cursor: string | undefined;
    let firstRun = store.rows.length === 0;
    for (;;) {
      const page = await fetchPage(cursor);
      let reachedKnown = false;
      for (const t of page.data) {
        if (known.has(String(t.id))) {
          reachedKnown = true;
          continue;
        }
        store.rows.push(sanitize(t));
        known.add(String(t.id));
        added++;
      }
      if (firstRun) {
        // First ever sync: this walk *is* the backfill.
        store.backfillCursor = page.hasMore ? page.next : null;
        store.complete = !page.hasMore;
      }
      if (reachedKnown || !page.hasMore || !page.next || timeLeft() < 3000) break;
      cursor = page.next;
      await sleep(PAGE_DELAY_MS);
    }
    firstRun = false;

    // 2) History backfill from the saved cursor.
    while (!store.complete && store.backfillCursor && timeLeft() > 3000) {
      await sleep(PAGE_DELAY_MS);
      const page = await fetchPage(store.backfillCursor);
      for (const t of page.data) {
        if (!known.has(String(t.id))) {
          store.rows.push(sanitize(t));
          known.add(String(t.id));
          backfilled++;
        }
      }
      store.backfillCursor = page.hasMore ? page.next : null;
      store.complete = !page.hasMore || !page.next;
    }
  } catch (err) {
    if (err instanceof MayarRateLimitError) rateLimited = true;
    else if (added + backfilled === 0) throw err;
  }

  store.rows.sort((a, b) => b.createdAt - a.createdAt);
  store.syncedAt = new Date().toISOString();
  try {
    await writeJson(PATH, store, etag);
  } catch (err) {
    if (!isPreconditionError(err)) throw err;
    // Someone else synced meanwhile: merge by id and overwrite.
    const latest = (await readJson<StoredSales>(PATH)).value ?? EMPTY;
    const merged = new Map(latest.rows.map((r) => [r.id, r]));
    for (const r of store.rows) merged.set(r.id, r);
    store.rows = [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
    store.complete = store.complete || latest.complete;
    await writeJson(PATH, store, null, true);
  }
  return { added, backfilled, complete: store.complete, total: store.rows.length, rateLimited };
}
