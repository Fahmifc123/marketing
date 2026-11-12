/** Shared (browser + server) helpers for the email database. */

export type GroupType = "category" | "tag";

export const GROUP_PREFIX = { category: "[Kategori] ", tag: "[Tag] ", send: "[Kirim] " } as const;

export const GROUP_LABEL: Record<GroupType, string> = { category: "Kategori", tag: "Tag" };

export function groupName(type: GroupType, name: string): string {
  return `${GROUP_PREFIX[type]}${name.trim()}`.slice(0, 100);
}

/** "[Tag] Alumni" → { type: "tag", name: "Alumni" }. Unprefixed segments count as categories. */
export function parseGroupName(raw: string): { type: GroupType | "send"; name: string } {
  if (raw.startsWith(GROUP_PREFIX.send)) return { type: "send", name: raw.slice(GROUP_PREFIX.send.length) };
  if (raw.startsWith(GROUP_PREFIX.tag)) return { type: "tag", name: raw.slice(GROUP_PREFIX.tag.length) };
  if (raw.startsWith(GROUP_PREFIX.category)) return { type: "category", name: raw.slice(GROUP_PREFIX.category.length) };
  return { type: "category", name: raw };
}

const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/;
export const isEmail = (v: string) => v.length <= 254 && EMAIL_RE.test(v);

export interface ParsedRow {
  email: string;
  firstName?: string;
  lastName?: string;
  /** From optional "kategori" / "tag" columns (several separated by ";"). */
  categories?: string[];
  tags?: string[];
  source?: string;
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * Reads a CSV (comma or semicolon, with or without header). Finds the email
 * column by header name or by content; optional name columns.
 */
export function parseContactsCsv(text: string): { rows: ParsedRow[]; invalid: number; duplicates: number } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], invalid: 0, duplicates: 0 };
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const first = splitCsvLine(lines[0], sep).map((h) => h.toLowerCase());
  const hasHeader = !first.some(isEmail);
  const find = (...names: string[]) => first.findIndex((h) => names.some((n) => h === n || h.replace(/[\s_-]/g, "") === n));
  let emailCol = hasHeader ? find("email", "e-mail", "emailaddress", "alamatemail", "surel") : -1;
  const firstCol = hasHeader ? find("firstname", "first_name", "nama", "name", "namadepan", "nama lengkap", "namalengkap") : -1;
  const lastCol = hasHeader ? find("lastname", "last_name", "namabelakang") : -1;
  const catCol = hasHeader ? find("kategori", "category", "categories") : -1;
  const tagCol = hasHeader ? find("tag", "tags", "label") : -1;
  const srcCol = hasHeader ? find("sumber", "source") : -1;
  const list = (v: string | undefined) => (v ?? "").split(/[;|]/).map((x) => x.trim().slice(0, 80)).filter(Boolean);
  const body = hasHeader ? lines.slice(1) : lines;
  if (emailCol < 0) {
    const sample = splitCsvLine(body[0] ?? "", sep);
    emailCol = sample.findIndex(isEmail);
  }
  const seen = new Set<string>();
  const rows: ParsedRow[] = [];
  let invalid = 0;
  let duplicates = 0;
  for (const line of body) {
    const cells = splitCsvLine(line, sep);
    const email = (cells[emailCol] ?? "").toLowerCase();
    if (!isEmail(email)) {
      invalid++;
      continue;
    }
    if (seen.has(email)) {
      duplicates++;
      continue;
    }
    seen.add(email);
    rows.push({
      email,
      ...(firstCol >= 0 && cells[firstCol] ? { firstName: cells[firstCol].slice(0, 80) } : {}),
      ...(lastCol >= 0 && cells[lastCol] ? { lastName: cells[lastCol].slice(0, 80) } : {}),
      ...(catCol >= 0 && list(cells[catCol]).length ? { categories: list(cells[catCol]) } : {}),
      ...(tagCol >= 0 && list(cells[tagCol]).length ? { tags: list(cells[tagCol]) } : {}),
      ...(srcCol >= 0 && cells[srcCol] ? { source: cells[srcCol].slice(0, 120) } : {}),
    });
  }
  return { rows, invalid, duplicates };
}

/** Addresses typed or pasted in a box (comma, semicolon, space or newline separated). */
export function parseEmailList(text: string): { rows: ParsedRow[]; invalid: string[] } {
  const seen = new Set<string>();
  const rows: ParsedRow[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const email = raw.replace(/^<|>$/g, "").trim().toLowerCase();
    if (!email) continue;
    if (!isEmail(email)) invalid.push(raw);
    else if (!seen.has(email)) {
      seen.add(email);
      rows.push({ email });
    }
  }
  return { rows, invalid };
}
