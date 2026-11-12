/**
 * Our own email database: contacts, categories and tags in one JSON document
 * in a PRIVATE Vercel Blob store. Auth: Vercel OIDC with DATA_STORE_ID (set
 * when the store is connected with prefix DATA), or DATA_BLOB_READ_WRITE_TOKEN.
 * Resend is only used to send. Writes use the blob ETag (ifMatch) so two
 * people saving at once never overwrite each other silently.
 */
import "server-only";

import { BlobNotFoundError, BlobPreconditionFailedError, get, head, put } from "@vercel/blob";

import { isEmail, type GroupType, type ParsedRow } from "@/lib/contacts";

const PATH = "db/contacts.json";

export class StoreConfigError extends Error {}
export class StoreInputError extends Error {}

export interface StoredGroup {
  id: string;
  type: GroupType;
  name: string;
}

export interface StoredContact {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  groups: string[];
  unsubscribed: boolean;
  source: string | null;
  createdAt: string;
}

interface Db {
  version: 1;
  groups: StoredGroup[];
  contacts: StoredContact[];
}

const EMPTY: Db = { version: 1, groups: [], contacts: [] };

function auth(): { token: string } | { storeId: string } {
  const token = process.env.DATA_BLOB_READ_WRITE_TOKEN?.trim();
  if (token) return { token };
  const storeId = process.env.DATA_STORE_ID?.trim();
  if (storeId) return { storeId };
  throw new StoreConfigError("Storage database belum disambungkan (DATA_STORE_ID).");
}

export function storeReady(): boolean {
  return Boolean(process.env.DATA_BLOB_READ_WRITE_TOKEN?.trim() || process.env.DATA_STORE_ID?.trim());
}

async function load(): Promise<{ db: Db; etag: string | null }> {
  // The API ETag (what put's ifMatch compares) comes from head(); the GET
  // response carries the CDN's own ETag, which never matches.
  let etag: string | null;
  try {
    etag = (await head(PATH, auth())).etag;
  } catch (err) {
    if (err instanceof BlobNotFoundError) return { db: structuredClone(EMPTY), etag: null };
    throw err;
  }
  const res = await get(PATH, { access: "private", ...auth(), useCache: false });
  if (!res?.stream) return { db: structuredClone(EMPTY), etag: null };
  const db = JSON.parse(await new Response(res.stream).text()) as Db;
  return { db: { ...EMPTY, ...db }, etag };
}

async function save(db: Db, etag: string | null, force = false) {
  await put(PATH, JSON.stringify(db), {
    access: "private",
    ...auth(),
    contentType: "application/json",
    addRandomSuffix: false,
    ...(force ? { allowOverwrite: true } : etag ? { ifMatch: etag } : { allowOverwrite: false }),
    cacheControlMaxAge: 60,
  });
}

const isPrecondition = (err: unknown) =>
  err instanceof BlobPreconditionFailedError || /precondition|etag|already exists/i.test(`${(err as Error)?.name} ${(err as Error)?.message}`);

/**
 * Read → change → write. Conditional on the ETag so concurrent saves are not
 * lost; if the conditional write keeps failing (ETag format mismatch), the
 * last attempt overwrites unconditionally — fine for a small internal team.
 */
async function mutate<T>(fn: (db: Db) => T): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { db, etag } = await load();
    const result = fn(db);
    try {
      await save(db, attempt < 2 ? etag : null, attempt === 2);
      return result;
    } catch (err) {
      console.warn("[contacts] write retry", attempt, (err as Error)?.name, String((err as Error)?.message).slice(0, 160));
      if (!isPrecondition(err) || attempt === 2) throw err;
    }
  }
  throw new Error("unreachable");
}

export async function readDb(): Promise<Db> {
  return (await load()).db;
}

const newId = () => crypto.randomUUID().slice(0, 12);
const clean = (v: string | null | undefined, max = 80) => {
  const s = (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
};

// ---------- groups ----------

export interface GroupWithCount extends StoredGroup {
  recipients: number;
  total: number;
  capped: boolean;
}

export function groupsWithCounts(db: Db): GroupWithCount[] {
  const active = new Map<string, number>();
  const total = new Map<string, number>();
  for (const c of db.contacts) {
    for (const g of c.groups) {
      total.set(g, (total.get(g) ?? 0) + 1);
      if (!c.unsubscribed) active.set(g, (active.get(g) ?? 0) + 1);
    }
  }
  return db.groups
    .map((g) => ({ ...g, recipients: active.get(g.id) ?? 0, total: total.get(g.id) ?? 0, capped: false }))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "category" ? -1 : 1));
}

function findOrCreateGroup(db: Db, type: GroupType, name: string): StoredGroup {
  const n = name.trim().slice(0, 80);
  const existing = db.groups.find((g) => g.type === type && g.name.toLowerCase() === n.toLowerCase());
  if (existing) return existing;
  const g = { id: newId(), type, name: n };
  db.groups.push(g);
  return g;
}

export function createGroup(type: GroupType, name: string) {
  return mutate((db) => findOrCreateGroup(db, type, name));
}

export function renameGroup(id: string, name: string) {
  return mutate((db) => {
    const g = db.groups.find((x) => x.id === id);
    if (!g) throw new StoreInputError("Kategori/tag tidak ditemukan.");
    g.name = name.trim().slice(0, 80);
  });
}

/** Removes the category/tag; contacts stay. */
export function deleteGroup(id: string) {
  return mutate((db) => {
    db.groups = db.groups.filter((g) => g.id !== id);
    for (const c of db.contacts) c.groups = c.groups.filter((g) => g !== id);
  });
}

// ---------- contacts ----------

export function queryContacts(db: Db, opts: { groupId?: string; search?: string; offset?: number; limit?: number }) {
  const q = opts.search?.trim().toLowerCase();
  let list = db.contacts;
  if (opts.groupId) list = list.filter((c) => c.groups.includes(opts.groupId!));
  if (q) list = list.filter((c) => `${c.email} ${c.firstName ?? ""} ${c.lastName ?? ""}`.toLowerCase().includes(q));
  list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.email.localeCompare(b.email));
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? 50;
  return { contacts: list.slice(offset, offset + limit), total: list.length, next: offset + limit < list.length ? offset + limit : null };
}

function validGroupIds(db: Db, ids: string[]) {
  const known = new Set(db.groups.map((g) => g.id));
  return ids.filter((id) => known.has(id));
}

export function addContact(input: { email: string; firstName?: string; lastName?: string; groupIds: string[] }) {
  const email = input.email.trim().toLowerCase();
  if (!isEmail(email)) throw new StoreInputError("Format email tidak valid.");
  return mutate((db) => {
    const groups = validGroupIds(db, input.groupIds);
    const existing = db.contacts.find((c) => c.email === email);
    if (existing) {
      existing.groups = [...new Set([...existing.groups, ...groups])];
      if (input.firstName) existing.firstName = clean(input.firstName);
      if (input.lastName) existing.lastName = clean(input.lastName);
      return { existed: true };
    }
    db.contacts.push({
      id: newId(),
      email,
      firstName: clean(input.firstName),
      lastName: clean(input.lastName),
      groups,
      unsubscribed: false,
      source: "manual",
      createdAt: new Date().toISOString(),
    });
    return { existed: false };
  });
}

export function updateContact(input: { id: string; firstName?: string | null; lastName?: string | null; unsubscribed?: boolean; groups?: string[] }) {
  return mutate((db) => {
    const c = db.contacts.find((x) => x.id === input.id);
    if (!c) throw new StoreInputError("Kontak tidak ditemukan.");
    if (input.firstName !== undefined) c.firstName = clean(input.firstName);
    if (input.lastName !== undefined) c.lastName = clean(input.lastName);
    if (input.unsubscribed !== undefined) c.unsubscribed = input.unsubscribed;
    if (input.groups) c.groups = validGroupIds(db, input.groups);
  });
}

export function removeContact(id: string) {
  return mutate((db) => {
    db.contacts = db.contacts.filter((c) => c.id !== id);
  });
}

export interface ImportRow extends ParsedRow {
  /** Category/tag names from the CSV (created when missing). */
  categories?: string[];
  tags?: string[];
  source?: string;
}

/** Upserts rows; adds (never removes) groups. Never re-subscribes someone who unsubscribed. */
export function importContacts(rows: ImportRow[], groupIds: string[], source: string) {
  return mutate((db) => {
    const base = validGroupIds(db, groupIds);
    const byEmail = new Map(db.contacts.map((c) => [c.email, c]));
    let created = 0;
    let updated = 0;
    const now = new Date().toISOString();
    for (const r of rows) {
      const email = r.email.trim().toLowerCase();
      if (!isEmail(email)) continue;
      const named = [
        ...(r.categories ?? []).filter(Boolean).map((n) => findOrCreateGroup(db, "category", n).id),
        ...(r.tags ?? []).filter(Boolean).map((n) => findOrCreateGroup(db, "tag", n).id),
      ];
      const groups = [...base, ...named];
      const c = byEmail.get(email);
      if (c) {
        c.groups = [...new Set([...c.groups, ...groups])];
        c.firstName ??= clean(r.firstName);
        c.lastName ??= clean(r.lastName);
        updated++;
      } else {
        const fresh: StoredContact = {
          id: newId(),
          email,
          firstName: clean(r.firstName),
          lastName: clean(r.lastName),
          groups: [...new Set(groups)],
          unsubscribed: false,
          source: clean(r.source, 120) ?? source,
          createdAt: now,
        };
        db.contacts.push(fresh);
        byEmail.set(email, fresh);
        created++;
      }
    }
    return { created, updated, total: db.contacts.length };
  });
}

/** Subscribed recipients for the chosen groups plus extra rows (deduped). Extra rows that unsubscribed are dropped. */
export function resolveRecipients(db: Db, groupIds: string[], extra: ParsedRow[]): ParsedRow[] {
  const unsub = new Set(db.contacts.filter((c) => c.unsubscribed).map((c) => c.email));
  const out = new Map<string, ParsedRow>();
  if (groupIds.length) {
    const want = new Set(groupIds);
    for (const c of db.contacts) {
      if (!c.unsubscribed && c.groups.some((g) => want.has(g))) {
        out.set(c.email, { email: c.email, firstName: c.firstName ?? undefined, lastName: c.lastName ?? undefined });
      }
    }
  }
  for (const r of extra) {
    const email = r.email.toLowerCase();
    if (!unsub.has(email) && !out.has(email)) out.set(email, { ...r, email });
  }
  return [...out.values()];
}

export function markUnsubscribed(email: string) {
  const e = email.trim().toLowerCase();
  return mutate((db) => {
    const c = db.contacts.find((x) => x.email === e);
    if (c) c.unsubscribed = true;
    else db.contacts.push({ id: newId(), email: e, firstName: null, lastName: null, groups: [], unsubscribed: true, source: "unsubscribe", createdAt: new Date().toISOString() });
  });
}
