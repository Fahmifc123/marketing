"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/lib/email-api-client";
import {
  byProduct,
  dailySeries,
  inMonth,
  isPaid,
  monthKey,
  monthlySeries,
  rupiah,
  rupiahShort,
  totals,
  type SaleRow,
  type SalesSnapshot,
} from "@/lib/sales";

const STALE_MS = 15 * 60 * 1000;
const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const monthLabel = (key: string, long = false) => {
  const [y, m] = key.split("-").map(Number);
  const names = long
    ? ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
    : MONTHS_ID;
  return `${names[m - 1]} ${long ? y : String(y).slice(2)}`;
};
const dayLabel = (key: string) => {
  const [, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS_ID[m - 1]}`;
};
const fmtDateTime = (ms: number) =>
  new Date(ms).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

interface Bar {
  key: string;
  label: string;
  value: number;
  detail: string;
}

/** Single-series bar chart (one hue, rounded data-ends, 2px gaps, hover tooltip). */
function BarChart({ bars, height = 220, ariaLabel, labelEvery = 1 }: { bars: Bar[]; height?: number; ariaLabel: string; labelEvery?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const nice = (() => {
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    const f = max / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  })();
  const W = 1000;
  const H = height;
  const padL = 0;
  const padB = 22;
  const plotH = H - padB - 6;
  const slot = (W - padL) / bars.length;
  const bw = Math.max(2, slot - 2);
  const y = (v: number) => 6 + plotH - (v / nice) * plotH;

  return (
    <div ref={wrap} className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={ariaLabel} className="block h-[220px] w-full">
        {[0.5, 1].map((f) => (
          <line key={f} x1={0} x2={W} y1={y(nice * f)} y2={y(nice * f)} stroke="var(--color-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {bars.map((b, i) => {
          const h = Math.max(b.value > 0 ? 2 : 0, y(0) - y(b.value));
          const x = padL + i * slot + 1;
          const r = Math.min(4, bw / 2, h);
          return (
            <g key={b.key}>
              {h > 0 && (
                <path
                  d={`M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + bw - r} Q${x + bw},${y(0) - h} ${x + bw},${y(0) - h + r} V${y(0)} Z`}
                  fill={hover === null || hover === i ? "var(--color-navy)" : "color-mix(in srgb, var(--color-navy) 45%, white)"}
                />
              )}
              <rect x={padL + i * slot} y={0} width={slot} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex text-[10px] text-muted">
        {bars.map((b, i) => (
          <span key={b.key} className="flex-1 truncate text-center">
            {i % labelEvery === 0 ? b.label : ""}
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute top-0 right-0 text-[10px] text-muted">{rupiahShort(nice)}</div>
      {hover !== null && bars[hover] && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-md"
          style={{ left: `${((hover + 0.5) / bars.length) * 100}%`, top: 4 }}
        >
          <p className="font-semibold text-navy">{bars[hover].label}</p>
          <p className="text-navy">{rupiah(bars[hover].value)}</p>
          <p className="text-muted">{bars[hover].detail}</p>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, sub, hero }: { label: string; value: string; sub?: string; hero?: boolean }) {
  return (
    <div className={`rounded-xl border border-line bg-white p-4 ${hero ? "sm:col-span-2" : ""}`}>
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{label}</p>
      <p className={`mt-1 font-bold tracking-tight text-navy tabular-nums ${hero ? "text-3xl sm:text-4xl" : "text-xl"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** Mayar sales dashboard for the marketing team: money in, fees, net, by day/month/product. */
export default function SalesDashboard() {
  const [snap, setSnap] = useState<SalesSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const [month, setMonth] = useState(() => monthKey(now));
  const syncingRef = useRef(false);

  const load = useCallback(async () => {
    const s = await api<SalesSnapshot>("/api/sales");
    setSnap(s);
    return s;
  }, []);

  const sync = useCallback(
    async (force = false) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      setError(null);
      try {
        let s = await load();
        const stale = !s.syncedAt || Date.now() - Date.parse(s.syncedAt) > STALE_MS;
        let rounds = 0;
        while ((force || stale || !s.complete) && rounds < 6) {
          setSyncing(s.complete ? "Mengambil transaksi terbaru dari Mayar…" : `Mengambil riwayat transaksi… (${s.rows.length} tersimpan)`);
          const r = await api<{ complete: boolean; rateLimited: boolean }>("/api/sales/sync", { method: "POST" });
          s = await load();
          rounds++;
          force = false;
          if (r.rateLimited) {
            setError(r.complete ? null : "Mayar membatasi request. Riwayat lama akan dilanjutkan otomatis saat halaman dibuka lagi.");
            break;
          }
          if (r.complete) break;
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        syncingRef.current = false;
        setSyncing(null);
      }
    },
    [load],
  );

  useEffect(() => {
    const t = setTimeout(() => void sync(), 0);
    return () => clearTimeout(t);
  }, [sync]);

  const rows = useMemo(() => snap?.rows ?? [], [snap]);
  const monthOptions = useMemo(() => {
    const keys = new Set(rows.map((r) => monthKey(r.createdAt)));
    keys.add(monthKey(now));
    return [...keys].sort().reverse();
  }, [rows, now]);

  const monthRows = useMemo(() => inMonth(rows, month), [rows, month]);
  const prevKey = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }, [month]);
  const t = totals(monthRows);
  const prev = totals(inMonth(rows, prevKey));
  const delta = prev.net > 0 ? ((t.net - prev.net) / prev.net) * 100 : null;

  const daily = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const isCurrent = month === monthKey(now);
    const end = isCurrent ? now : Date.UTC(y, m - 1, lastDay, 12);
    const days = isCurrent ? Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", day: "numeric" }).format(new Date(now))) : lastDay;
    return dailySeries(rows, days, end).map((d) => ({ key: d.key, label: String(Number(d.key.slice(8))), value: d.net, detail: `${dayLabel(d.key)} · ${d.paid} transaksi berbayar` }));
  }, [rows, month, now]);

  const monthly = useMemo(
    () => monthlySeries(rows, 12, now).map((d) => ({ key: d.key, label: d.key.endsWith("-01") ? monthLabel(d.key) : MONTHS_ID[Number(d.key.slice(5)) - 1], value: d.net, detail: `${monthLabel(d.key, true)} · ${d.paid} transaksi berbayar` })),
    [rows, now],
  );
  const products = useMemo(() => byProduct(monthRows), [monthRows]);
  const maxProductNet = Math.max(1, ...products.map((p) => p.net));
  const recent = monthRows.slice(0, 25);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="sales-month" className="text-sm font-semibold text-navy">
            Bulan
          </label>
          <select id="sales-month" value={month} onChange={(e) => setMonth(e.target.value)} className="select w-auto py-2 text-sm">
            {monthOptions.map((k) => (
              <option key={k} value={k}>
                {monthLabel(k, true)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>
            {syncing ?? (snap?.syncedAt ? `Sinkron terakhir ${fmtDateTime(Date.parse(snap.syncedAt))} WIB` : "Belum pernah sinkron")}
            {snap && !snap.complete && !syncing ? " · riwayat lama belum lengkap" : ""}
          </span>
          <button type="button" onClick={() => void sync(true)} disabled={Boolean(syncing)} className="btn-secondary px-3 py-1.5 text-xs">
            {syncing ? "Menyinkron…" : "Sinkron sekarang"}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-danger/20 bg-danger-bg px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {!snap ? (
        <p className="panel p-6 text-sm text-muted">Memuat data penjualan…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile
              hero
              label={`Dana masuk neto · ${monthLabel(month, true)}`}
              value={rupiah(t.net)}
              sub={delta === null ? "Setelah fee Mayar & Xendit" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(0)}% dibanding ${monthLabel(prevKey, true)} (${rupiahShort(prev.net)})`}
            />
            <Tile label="Kotor (dibayar pembeli)" value={rupiahShort(t.gross)} sub={rupiah(t.gross)} />
            <Tile label="Fee Mayar + Xendit" value={rupiahShort(t.fee)} sub={t.gross ? `${((t.fee / t.gross) * 100).toFixed(1)}% dari kotor` : "—"} />
            <Tile label="Transaksi berbayar" value={String(t.paid)} sub={t.paid ? `rata-rata ${rupiahShort(t.net / t.paid)} neto` : "—"} />
            <Tile label="Pendaftar gratis" value={String(t.free)} sub="Webinar / kelas gratis" />
          </div>

          <section className="panel p-5 sm:p-6">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-navy">Neto per hari · {monthLabel(month, true)}</h2>
              <span className="text-xs text-muted">Arahkan kursor ke batang untuk detail</span>
            </div>
            <BarChart bars={daily} ariaLabel={`Neto per hari ${monthLabel(month, true)}`} labelEvery={daily.length > 20 ? 3 : 1} />
          </section>

          <section className="panel p-5 sm:p-6">
            <h2 className="mb-3 text-sm font-semibold text-navy">Neto per bulan · 12 bulan terakhir</h2>
            <BarChart bars={monthly} ariaLabel="Neto per bulan, 12 bulan terakhir" />
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-xs font-semibold text-navy-600">Lihat sebagai tabel</summary>
              <table className="mt-2 w-full text-left text-xs">
                <thead className="text-muted">
                  <tr>
                    <th className="py-1 font-semibold">Bulan</th>
                    <th className="py-1 text-right font-semibold">Transaksi berbayar</th>
                    <th className="py-1 text-right font-semibold">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {[...monthly].reverse().map((m) => (
                    <tr key={m.key} className="border-t border-line/60">
                      <td className="py-1 text-navy">{monthLabel(m.key, true)}</td>
                      <td className="py-1 text-right tabular-nums">{m.detail.split("· ")[1]?.split(" ")[0]}</td>
                      <td className="py-1 text-right font-semibold text-navy tabular-nums">{rupiah(m.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <section className="panel min-w-0 p-5 sm:p-6">
              <h2 className="mb-3 text-sm font-semibold text-navy">Per produk · {monthLabel(month, true)}</h2>
              {products.length === 0 ? (
                <p className="text-sm text-muted">Belum ada transaksi bulan ini.</p>
              ) : (
                <ul className="space-y-3">
                  {products.map((p) => (
                    <li key={p.product}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate font-medium text-navy" title={p.product}>
                          {p.product}
                        </span>
                        <span className="shrink-0 font-semibold text-navy tabular-nums">{rupiah(p.net)}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-pale">
                        <div className="h-2 rounded-full bg-navy" style={{ width: `${(p.net / maxProductNet) * 100}%` }} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {p.paid} berbayar{p.free ? ` · ${p.free} gratis` : ""} · kotor {rupiah(p.gross)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel min-w-0 p-5 sm:p-6">
              <h2 className="mb-3 text-sm font-semibold text-navy">Transaksi terbaru · {monthLabel(month, true)}</h2>
              {recent.length === 0 ? (
                <p className="text-sm text-muted">Belum ada transaksi bulan ini.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[10px] tracking-[0.08em] text-muted uppercase">
                      <tr className="border-b border-line">
                        <th className="py-2 pr-2 font-semibold">Waktu</th>
                        <th className="py-2 pr-2 font-semibold">Pembeli</th>
                        <th className="py-2 pr-2 font-semibold">Produk</th>
                        <th className="py-2 text-right font-semibold">Neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((r: SaleRow) => (
                        <tr key={r.id} className="border-b border-line/60 align-top">
                          <td className="py-2 pr-2 whitespace-nowrap text-muted">{fmtDateTime(r.createdAt)}</td>
                          <td className="py-2 pr-2 text-navy">{r.firstName || "—"}</td>
                          <td className="max-w-[180px] truncate py-2 pr-2 text-navy" title={r.product}>
                            {r.product}
                            <span className="block text-[10px] text-muted">{r.method}</span>
                          </td>
                          <td className="py-2 text-right font-semibold whitespace-nowrap text-navy tabular-nums">{isPaid(r) ? rupiah(r.net) : "Gratis"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <p className="text-xs leading-relaxed text-muted">
            Sumber: API Mayar (hanya baca), disinkron otomatis saat halaman dibuka bila data lebih dari 15 menit. Neto = kotor − fee Mayar &amp; Xendit. Angka
            bersifat estimasi: refund belum terdeteksi lewat API Mayar, dan biaya iklan/trainer tidak dikurangkan. Email &amp; nomor HP pembeli tidak disimpan.
          </p>
        </>
      )}
    </div>
  );
}
