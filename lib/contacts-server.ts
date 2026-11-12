/**
 * Email database on top of Resend Contacts.
 *
 * - Every contact lives in Resend (one place, unsubscribes handled by Resend).
 * - Categories and tags are Resend Segments named "[Kategori] …" / "[Tag] …".
 *   A contact can be in many. Segments without a prefix show as categories.
 * - Sending to several tags, a CSV or typed addresses builds a one-off
 *   "[Kirim] …" segment (hidden from the database) via a single CSV import,
 *   which is then broadcast like any other segment.
 */
import "server-only";

import { Resend } from "resend";

import { emailConfig, countSegmentRecipients, EmailConfigError, ResendRequestError } from "@/lib/resend-server";
import { GROUP_PREFIX, groupName, parseGroupName, type GroupType } from "@/lib/contacts";

export const CONTACT_PAGE = 50;
/** Max contacts collected when merging tags into a send list. */
export const MAX_AUDIENCE = 20_000;

function resend(): Resend {
  const { apiKey } = emailConfig();
  if (!apiKey) throw new EmailConfigError("RESEND_API_KEY belum diatur di server.");
  return new Resend(apiKey);
}

function unwrap<T>(res: { data: T | null; error: { message: string; statusCode: number | null } | null }): T {
  if (res.error || res.data === null) {
    throw new ResendRequestError(res.error?.message ?? "Resend request failed", res.error?.statusCode ?? null);
  }
  return res.data;
}

export interface Group {
  id: string;
  type: GroupType;
  name: string;
  recipients: number;
  capped: boolean;
}

async function allSegments() {
  const r = resend();
  const out: { id: string; name: string }[] = [];
  let after: string | undefined;
  for (let i = 0; i < 20; i++) {
    const page = unwrap(await r.segments.list({ limit: 100, ...(after ? { after } : {}) }));
    out.push(...page.data.map((s) => ({ id: s.id, name: s.name })));
    if (!page.has_more || page.data.length === 0) break;
    after = page.data[page.data.length - 1].id;
  }
  return out;
}

/** Categories and tags (send lists hidden), with subscribed counts when asked. */
export async function listGroups(withCounts = true): Promise<Group[]> {
  const segs = (await allSegments())
    .map((s) => ({ id: s.id, ...parseGroupName(s.name) }))
    .filter((s): s is { id: string; type: GroupType; name: string } => s.type !== "send");
  const groups = await Promise.all(
    segs.map(async (s) => ({
      ...s,
      ...(withCounts ? await countSegmentRecipients(s.id) : { recipients: 0, capped: false }),
    })),
  );
  return groups.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "category" ? -1 : 1));
}

export async function createGroup(type: GroupType, name: string) {
  return unwrap(await resend().segments.create({ name: groupName(type, name) }));
}

export async function renameGroup(id: string, type: GroupType, name: string) {
  return unwrap(await resend().segments.update(id, { name: groupName(type, name) }));
}

/** Deletes the category/tag only — contacts stay in the database. */
export async function deleteGroup(id: string) {
  return unwrap(await resend().segments.remove(id));
}

export interface ContactRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  unsubscribed: boolean;
  createdAt: string;
}

export async function listContacts(opts: { segmentId?: string; after?: string }) {
  const page = unwrap(
    await resend().contacts.list({
      limit: CONTACT_PAGE,
      ...(opts.segmentId ? { segmentId: opts.segmentId } : {}),
      ...(opts.after ? { after: opts.after } : {}),
    }),
  );
  const contacts: ContactRow[] = page.data.map((c) => ({
    id: c.id,
    email: c.email,
    firstName: c.first_name,
    lastName: c.last_name,
    unsubscribed: c.unsubscribed,
    createdAt: c.created_at,
  }));
  return { contacts, hasMore: page.has_more, next: page.has_more ? contacts[contacts.length - 1]?.id : null };
}

export async function contactGroups(contactId: string): Promise<string[]> {
  const page = unwrap(await resend().contacts.segments.list({ contactId, limit: 100 }));
  return page.data.filter((s) => parseGroupName(s.name).type !== "send").map((s) => s.id);
}

export async function addContact(input: { email: string; firstName?: string; lastName?: string; groupIds: string[] }) {
  const r = resend();
  const res = await r.contacts.create({
    email: input.email,
    firstName: input.firstName || undefined,
    lastName: input.lastName || undefined,
    segments: input.groupIds.map((id) => ({ id })),
  });
  if (res.error && (res.error.statusCode === 409 || /exist/i.test(res.error.message))) {
    // Already in the database: just attach the chosen groups.
    for (const segmentId of input.groupIds) unwrap(await r.contacts.segments.add({ email: input.email, segmentId }));
    return { existed: true };
  }
  unwrap(res);
  return { existed: false };
}

export async function updateContact(input: {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  unsubscribed?: boolean;
  addGroups: string[];
  removeGroups: string[];
}) {
  const r = resend();
  unwrap(
    await r.contacts.update({
      id: input.id,
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.unsubscribed !== undefined ? { unsubscribed: input.unsubscribed } : {}),
    }),
  );
  for (const segmentId of input.addGroups) unwrap(await r.contacts.segments.add({ contactId: input.id, segmentId }));
  for (const segmentId of input.removeGroups) unwrap(await r.contacts.segments.remove({ contactId: input.id, segmentId }));
}

export async function removeContact(id: string) {
  unwrap(await resend().contacts.remove({ id }));
}

export interface ImportRow {
  email: string;
  firstName?: string;
  lastName?: string;
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function rowsToCsv(rows: ImportRow[]): string {
  return ["email,first_name,last_name", ...rows.map((r) => [r.email, r.firstName ?? "", r.lastName ?? ""].map(csvCell).join(","))].join("\n");
}

/** Upserts contacts into the database and the given groups in one Resend import job. */
export async function importContacts(rows: ImportRow[], groupIds: string[]) {
  const file = new Blob([rowsToCsv(rows)], { type: "text/csv" });
  const job = unwrap(
    await resend().contacts.imports.create({
      file,
      columnMap: { email: "email", firstName: "first_name", lastName: "last_name" },
      onConflict: "upsert",
      segments: groupIds.map((id) => ({ id })),
    }),
  );
  return { importId: job.id };
}

export async function importStatus(id: string) {
  const job = unwrap(await resend().contacts.imports.get(id));
  return { status: job.status, counts: job.counts };
}

/** Subscribed emails of the given groups, de-duplicated. */
async function collectEmails(groupIds: string[]): Promise<Map<string, ImportRow>> {
  const r = resend();
  const out = new Map<string, ImportRow>();
  for (const segmentId of groupIds) {
    let after: string | undefined;
    for (;;) {
      const page = unwrap(await r.contacts.list({ segmentId, limit: 100, ...(after ? { after } : {}) }));
      for (const c of page.data) {
        if (!c.unsubscribed) out.set(c.email.toLowerCase(), { email: c.email, firstName: c.first_name ?? undefined, lastName: c.last_name ?? undefined });
      }
      if (out.size > MAX_AUDIENCE) throw new ResendRequestError(`Terlalu banyak penerima (lebih dari ${MAX_AUDIENCE}).`, 400);
      if (!page.has_more || page.data.length === 0) break;
      after = page.data[page.data.length - 1].id;
    }
  }
  return out;
}

/**
 * Builds a one-off send list: selected groups ∪ extra rows (CSV / typed),
 * saved as a hidden "[Kirim] …" segment. Extra rows are also stored in the
 * database (and in `saveToGroupIds`, if given).
 */
export async function buildSendList(input: { label: string; groupIds: string[]; rows: ImportRow[]; saveToGroupIds: string[] }) {
  const merged = await collectEmails(input.groupIds);
  for (const row of input.rows) {
    const key = row.email.toLowerCase();
    if (!merged.has(key)) merged.set(key, row);
  }
  if (merged.size === 0) throw new ResendRequestError("Tidak ada penerima aktif di pilihan ini.", 400);
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const seg = unwrap(await resend().segments.create({ name: `${GROUP_PREFIX.send}${stamp} · ${input.label}`.slice(0, 120) }));
  const { importId } = await importContacts([...merged.values()], [seg.id]);
  // CSV / typed addresses can also be kept in chosen categories or tags.
  if (input.rows.length && input.saveToGroupIds.length) await importContacts(input.rows, input.saveToGroupIds);
  return { segmentId: seg.id, importId, total: merged.size };
}
