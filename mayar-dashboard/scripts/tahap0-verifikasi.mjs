#!/usr/bin/env node
/**
 * Tahap 0 — verifikasi API Mayar (hanya baca).
 *
 * GET https://api.mayar.id/hl/v2/transactions TANPA parameter `fields`,
 * menyimpan respons JSON mentah ke data/, lalu mencari field afiliator,
 * komisi dan refund. API key dibaca dari env MAYAR_API_KEY dan tidak pernah
 * dicetak atau ditulis ke file.
 *
 * Pakai:  MAYAR_API_KEY=... node scripts/tahap0-verifikasi.mjs [--pages 3] [--status paid]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.mayar.id/hl/v2/transactions";
const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, "..", "data");

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const pages = Math.max(1, Math.min(20, Number(opt("pages", "3"))));
const status = opt("status", "");

const key = process.env.MAYAR_API_KEY?.trim();
if (!key) {
  console.error("MAYAR_API_KEY belum diset. Contoh: MAYAR_API_KEY=xxxx node scripts/tahap0-verifikasi.mjs");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(startingAfter) {
  const url = new URL(API);
  url.searchParams.set("limit", "50");
  if (status) url.searchParams.set("status", status);
  if (startingAfter) url.searchParams.set("startingAfter", startingAfter);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { nonJson: text.slice(0, 500) };
  }
  if (!res.ok) {
    console.error(`HTTP ${res.status} dari Mayar:`, JSON.stringify(body).slice(0, 300));
    process.exit(2);
  }
  return body;
}

/** Flattens every key path seen in the data, e.g. data[].paymentLinkTransaction.affiliate.code */
function collectPaths(value, path = "", out = new Map()) {
  if (Array.isArray(value)) {
    for (const v of value) collectPaths(v, `${path}[]`, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collectPaths(v, path ? `${path}.${k}` : k, out);
  } else {
    const types = out.get(path) ?? new Set();
    types.add(value === null ? "null" : typeof value);
    out.set(path, types);
  }
  return out;
}

const PATTERNS = {
  "kode/nama afiliator": /affiliat|afiliat|referr|referral|\bma\b|(^|\.)ma$|partner|reseller|promoter/i,
  komisi: /commission|komisi|payout|share|reward/i,
  refund: /refund|chargeback|revers|void|cancel/i,
  "fee / neto": /fee|net|credit|debit|balance/i,
};

mkdirSync(DATA_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const all = [];
let cursor;
for (let p = 1; p <= pages; p++) {
  const body = await fetchPage(cursor);
  const file = join(DATA_DIR, `transactions-${stamp}-p${p}.json`);
  writeFileSync(file, JSON.stringify(body, null, 2));
  const rows = Array.isArray(body?.data) ? body.data : [];
  all.push(...rows);
  console.log(`Halaman ${p}: ${rows.length} transaksi → ${file}`);
  if (!body?.hasMore || !body?.nextStartingAfter) break;
  cursor = body.nextStartingAfter;
  await sleep(1200);
}

const paths = collectPaths(all);
console.log(`\nTotal transaksi dibaca: ${all.length}`);
console.log(`Field unik di data: ${paths.size}`);

console.log("\n=== Semua path field (tanpa nilai) ===");
for (const [p, t] of [...paths].sort()) console.log(`  ${p}  (${[...t].join("|")})`);

console.log("\n=== Kecocokan kata kunci ===");
for (const [label, re] of Object.entries(PATTERNS)) {
  const hits = [...paths.keys()].filter((p) => re.test(p.replace(/\[\]/g, "")));
  console.log(`- ${label}: ${hits.length ? hits.join(", ") : "TIDAK ADA"}`);
}

const statuses = new Map();
for (const t of all) statuses.set(String(t.status), (statuses.get(String(t.status)) ?? 0) + 1);
console.log("\n=== Nilai status yang muncul ===");
for (const [s, n] of statuses) console.log(`  ${s}: ${n}`);

const negatives = all.filter((t) => Number(t.amount) < 0 || Number(t.credit) < 0).length;
console.log(`\nTransaksi dengan amount/credit negatif: ${negatives}`);

const withMa = all.filter((t) => /[?&]ma=/.test(JSON.stringify(t))).length;
console.log(`Transaksi yang memuat "ma=" di nilai mana pun (mis. URL): ${withMa}`);
