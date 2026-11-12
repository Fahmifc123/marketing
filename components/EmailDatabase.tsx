"use client";

import { useCallback, useEffect, useId, useState } from "react";

import { GROUP_LABEL, isEmail, parseContactsCsv, type GroupType, type ParsedRow } from "@/lib/contacts";
import { api, jsonInit, type GroupItem } from "@/lib/email-api-client";

interface Contact {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  unsubscribed: boolean;
  createdAt: string;
}

/** Checkbox list of categories & tags. */
export function GroupChecklist({
  groups,
  value,
  onChange,
  disabled,
  showCounts = false,
}: {
  groups: GroupItem[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  showCounts?: boolean;
}) {
  if (!groups.length) return <p className="text-xs text-muted">Belum ada kategori/tag. Buat di menu Database Email.</p>;
  return (
    <div className="space-y-2">
      {(["category", "tag"] as const).map((type) => {
        const list = groups.filter((g) => g.type === type);
        if (!list.length) return null;
        return (
          <div key={type}>
            <p className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{GROUP_LABEL[type]}</p>
            <div className="flex flex-wrap gap-1.5">
              {list.map((g) => {
                const on = value.includes(g.id);
                return (
                  <label
                    key={g.id}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-orange ${
                      on ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-navy-400"
                    } ${disabled ? "pointer-events-none opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      disabled={disabled}
                      onChange={() => onChange(on ? value.filter((v) => v !== g.id) : [...value, g.id])}
                    />
                    {g.name}
                    {showCounts && <span className={on ? "ml-1 text-white/70" : "ml-1 text-muted"}>{g.capped ? `${g.recipients}+` : g.recipients}</span>}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function useGroups(withCounts = true) {
  const [groups, setGroups] = useState<GroupItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setError(null);
    try {
      setGroups((await api<{ groups: GroupItem[] }>(`/api/email/groups${withCounts ? "" : "?counts=0"}`)).groups);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [withCounts]);
  useEffect(() => {
    const t = setTimeout(() => void reload(), 0);
    return () => clearTimeout(t);
  }, [reload]);
  return { groups, error, reload };
}

function GroupsPanel({
  groups,
  filter,
  onFilter,
  reload,
}: {
  groups: GroupItem[];
  filter: string;
  onFilter: (id: string) => void;
  reload: () => Promise<void>;
}) {
  const id = useId();
  const [type, setType] = useState<GroupType>("tag");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-4 p-5" aria-labelledby={`${id}-h`}>
      <p id={`${id}-h`} className="eyebrow">
        Kategori &amp; Tag
      </p>
      <button
        type="button"
        onClick={() => onFilter("")}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${filter === "" ? "bg-navy text-white" : "text-navy hover:bg-pale"}`}
      >
        Semua kontak
      </button>
      {(["category", "tag"] as const).map((t) => (
        <div key={t}>
          <p className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{GROUP_LABEL[t]}</p>
          <ul className="space-y-0.5">
            {groups
              .filter((g) => g.type === t)
              .map((g) => (
                <li key={g.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onFilter(g.id)}
                    className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm ${
                      filter === g.id ? "bg-navy text-white" : "text-navy hover:bg-pale"
                    }`}
                  >
                    <span className="truncate">{g.name}</span>
                    <span className={`text-xs tabular-nums ${filter === g.id ? "text-white/70" : "text-muted"}`}>{g.capped ? `${g.recipients}+` : g.recipients}</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Ubah nama ${g.name}`}
                    onClick={() => {
                      const next = window.prompt(`Nama baru untuk ${GROUP_LABEL[g.type]} "${g.name}"`, g.name);
                      if (next && next.trim() && next.trim() !== g.name) void run(() => api("/api/email/groups", jsonInit("PATCH", { id: g.id, type: g.type, name: next })));
                    }}
                    className="px-1 text-xs text-muted opacity-0 group-hover:opacity-100 hover:text-navy focus:opacity-100"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Hapus ${g.name}`}
                    onClick={() => {
                      if (window.confirm(`Hapus ${GROUP_LABEL[g.type].toLowerCase()} "${g.name}"? Kontaknya tetap ada di database.`)) {
                        void run(async () => {
                          await api(`/api/email/groups?id=${encodeURIComponent(g.id)}`, { method: "DELETE" });
                          if (filter === g.id) onFilter("");
                        });
                      }
                    }}
                    className="px-1 text-xs text-muted opacity-0 group-hover:opacity-100 hover:text-danger focus:opacity-100"
                  >
                    ✕
                  </button>
                </li>
              ))}
            {!groups.some((g) => g.type === t) && <li className="px-3 text-xs text-muted">Belum ada.</li>}
          </ul>
        </div>
      ))}
      <form
        className="space-y-2 border-t border-line pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void run(async () => {
            await api("/api/email/groups", jsonInit("POST", { type, name }));
            setName("");
          });
        }}
      >
        <p className="text-xs font-semibold text-navy">Tambah baru</p>
        <div className="flex gap-2">
          <select value={type} onChange={(e) => setType(e.target.value as GroupType)} aria-label="Jenis" className="select w-auto py-2 text-sm">
            <option value="tag">Tag</option>
            <option value="category">Kategori</option>
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="mis. Alumni Webinar" aria-label="Nama" className="field min-w-0 flex-1 py-2 text-sm" />
        </div>
        <button type="submit" disabled={busy || !name.trim()} className="btn-secondary w-full py-2 text-sm">
          Tambah
        </button>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </form>
    </section>
  );
}

function AddContact({ groups, defaultGroup, onDone }: { groups: GroupItem[]; defaultGroup: string; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [groupIds, setGroupIds] = useState<string[]>(defaultGroup ? [defaultGroup] : []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const clean = email.trim().toLowerCase();
        if (!isEmail(clean)) return setMsg({ ok: false, text: "Format email tidak valid." });
        setBusy(true);
        setMsg(null);
        try {
          const r = await api<{ existed: boolean }>("/api/email/contacts", jsonInit("POST", { email: clean, firstName, lastName, groupIds }));
          setMsg({ ok: true, text: r.existed ? `${clean} sudah ada — kategori/tag ditambahkan.` : `${clean} ditambahkan.` });
          setEmail("");
          setFirstName("");
          setLastName("");
          onDone();
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="email@contoh.com" aria-label="Email" className="field py-2 text-sm sm:col-span-3" required />
        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Nama depan" aria-label="Nama depan" maxLength={80} className="field py-2 text-sm" />
        <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Nama belakang" aria-label="Nama belakang" maxLength={80} className="field py-2 text-sm" />
        <button type="submit" disabled={busy} className="btn-secondary py-2 text-sm">
          {busy ? "Menyimpan…" : "Tambah kontak"}
        </button>
      </div>
      <GroupChecklist groups={groups} value={groupIds} onChange={setGroupIds} disabled={busy} />
      {msg && <p role="status" className={`text-xs ${msg.ok ? "text-navy" : "text-danger"}`}>{msg.text}</p>}
    </form>
  );
}

export function CsvPicker({ onRows, disabled }: { onRows: (r: { rows: ParsedRow[]; invalid: number; duplicates: number; name: string } | null) => void; disabled?: boolean }) {
  const id = useId();
  const [info, setInfo] = useState<string | null>(null);
  return (
    <div>
      <label
        htmlFor={id}
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-navy-300 bg-white px-4 py-3 text-sm font-semibold text-navy hover:border-navy hover:bg-canvas has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-orange ${
          disabled ? "pointer-events-none opacity-50" : ""
        }`}
      >
        <span aria-hidden="true" className="text-orange">
          +
        </span>
        Pilih file CSV
        <input
          id={id}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          disabled={disabled}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
              setInfo("File terlalu besar (maks 5 MB).");
              return onRows(null);
            }
            const parsed = parseContactsCsv(await file.text());
            setInfo(
              parsed.rows.length
                ? `${file.name}: ${parsed.rows.length} email valid${parsed.invalid ? `, ${parsed.invalid} baris dilewati (bukan email)` : ""}${parsed.duplicates ? `, ${parsed.duplicates} duplikat` : ""}.`
                : `${file.name}: tidak ada kolom email yang valid.`,
            );
            onRows(parsed.rows.length ? { ...parsed, name: file.name } : null);
          }}
        />
      </label>
      <p className="mt-1.5 text-xs text-muted">{info ?? "Kolom email wajib. Opsional: nama, \"kategori\" dan \"tag\" (beberapa dipisah ;) — kategori/tag otomatis dibuat. Pemisah koma atau titik koma."}</p>
    </div>
  );
}

function ImportCsv({ groups, defaultGroup, onDone }: { groups: GroupItem[]; defaultGroup: string; onDone: () => void }) {
  const [parsed, setParsed] = useState<{ rows: ParsedRow[]; name: string } | null>(null);
  const [groupIds, setGroupIds] = useState<string[]>(defaultGroup ? [defaultGroup] : []);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-3">
      <CsvPicker onRows={(r) => (setParsed(r), setMsg(null))} disabled={Boolean(busy)} />
      {parsed && (
        <>
          <p className="text-xs font-semibold text-navy">Masukkan ke kategori/tag (opsional):</p>
          <GroupChecklist groups={groups} value={groupIds} onChange={setGroupIds} disabled={Boolean(busy)} />
          <button
            type="button"
            disabled={Boolean(busy)}
            className="btn h-11 w-full bg-navy text-sm font-bold text-white hover:bg-navy-700 disabled:opacity-60"
            onClick={async () => {
              setBusy("Mengupload…");
              setMsg(null);
              try {
                const c = await api<{ created: number; updated: number; total: number }>("/api/email/contacts/import", jsonInit("POST", { rows: parsed.rows, groupIds }));
                setMsg({ ok: true, text: `Import selesai: ${c.created} baru, ${c.updated} diperbarui. Total database: ${c.total} kontak.` });
                setParsed(null);
                onDone();
              } catch (err) {
                setMsg({ ok: false, text: (err as Error).message });
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy ?? `SIMPAN ${parsed.rows.length} KONTAK`}
          </button>
        </>
      )}
      {msg && <p role="status" className={`text-xs ${msg.ok ? "text-navy" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}

function ContactEditor({ contact, groups, onClose, onChanged }: { contact: Contact; groups: GroupItem[]; onClose: () => void; onChanged: () => void }) {
  const [original, setOriginal] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [firstName, setFirstName] = useState(contact.firstName ?? "");
  const [lastName, setLastName] = useState(contact.lastName ?? "");
  const [unsubscribed, setUnsubscribed] = useState(contact.unsubscribed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ groupIds: string[] }>(`/api/email/contacts/groups?id=${encodeURIComponent(contact.id)}`)
      .then((r) => {
        setOriginal(r.groupIds);
        setSelected(r.groupIds);
      })
      .catch((err) => setError((err as Error).message));
  }, [contact.id]);

  async function save() {
    if (!original) return;
    setBusy(true);
    setError(null);
    try {
      await api(
        "/api/email/contacts",
        jsonInit("PATCH", {
          id: contact.id,
          firstName,
          lastName,
          unsubscribed,
          groups: selected,
        }),
      );
      onChanged();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`Edit ${contact.email}`} className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={onClose}>
      <div className="panel w-full max-w-lg space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="eyebrow">Edit kontak</p>
            <p className="truncate font-semibold text-navy">{contact.email}</p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost px-2 text-sm" aria-label="Tutup">
            ✕
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Nama depan" aria-label="Nama depan" className="field py-2 text-sm" />
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Nama belakang" aria-label="Nama belakang" className="field py-2 text-sm" />
        </div>
        {original ? <GroupChecklist groups={groups} value={selected} onChange={setSelected} disabled={busy} /> : <p className="text-xs text-muted">Memuat kategori/tag…</p>}
        <label className="flex items-center gap-2 text-sm text-navy">
          <input type="checkbox" checked={unsubscribed} onChange={(e) => setUnsubscribed(e.target.checked)} className="h-4 w-4 accent-navy" />
          Berhenti berlangganan (tidak akan menerima broadcast)
        </label>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        <div className="flex flex-wrap justify-between gap-2">
          <button
            type="button"
            disabled={busy}
            className="btn-ghost text-sm text-danger"
            onClick={async () => {
              if (!window.confirm(`Hapus ${contact.email} dari database?`)) return;
              setBusy(true);
              try {
                await api(`/api/email/contacts?id=${encodeURIComponent(contact.id)}`, { method: "DELETE" });
                onChanged();
                onClose();
              } catch (err) {
                setError((err as Error).message);
                setBusy(false);
              }
            }}
          >
            Hapus kontak
          </button>
          <button type="button" onClick={() => void save()} disabled={busy || !original} className="btn bg-navy px-5 py-2 text-sm font-bold text-white hover:bg-navy-700 disabled:opacity-60">
            {busy ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Database Email: contacts with categories & tags, stored in Resend. */
export default function EmailDatabase() {
  const { groups, error: groupsError, reload } = useGroups(true);
  const [filter, setFilter] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [tab, setTab] = useState<"add" | "csv">("add");

  const load = useCallback(
    async (offset?: number) => {
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams();
        if (filter) q.set("groupId", filter);
        if (query) q.set("search", query);
        if (offset) q.set("offset", String(offset));
        const r = await api<{ contacts: Contact[]; next: number | null; total: number }>(`/api/email/contacts?${q}`);
        setContacts((c) => (offset ? [...c, ...r.contacts] : r.contacts));
        setNext(r.next);
        setTotal(r.total);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [filter, query],
  );

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const refresh = () => {
    void load();
    void reload();
  };
  const shown = contacts;
  const filterName = groups?.find((g) => g.id === filter)?.name;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <div>
        {groupsError && <p role="alert" className="panel mb-4 p-4 text-sm text-danger">{groupsError}</p>}
        {groups ? <GroupsPanel groups={groups} filter={filter} onFilter={setFilter} reload={reload} /> : <p className="panel p-5 text-sm text-muted">Memuat kategori &amp; tag…</p>}
      </div>

      <div className="space-y-6">
        <section className="panel space-y-4 p-5 sm:p-6">
          <div role="tablist" className="inline-flex rounded-lg border border-line bg-white p-1 text-sm font-semibold">
            {(
              [
                ["add", "Tambah satu"],
                ["csv", "Import CSV"],
              ] as const
            ).map(([t, label]) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1.5 ${tab === t ? "bg-navy text-white" : "text-navy hover:bg-pale"}`}>
                {label}
              </button>
            ))}
          </div>
          {groups && (tab === "add" ? (
              <AddContact key={filter} groups={groups} defaultGroup={filter} onDone={refresh} />
            ) : (
              <ImportCsv key={filter} groups={groups} defaultGroup={filter} onDone={refresh} />
            ))}
        </section>

        <section className="panel p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">
              {filterName ? `Kontak · ${filterName}` : "Semua kontak"} · {total}
            </p>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari email atau nama…" aria-label="Cari kontak" className="field w-full py-2 text-sm sm:w-64" />
          </div>
          {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] tracking-[0.08em] text-muted uppercase">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-semibold">Email</th>
                  <th className="py-2 pr-3 font-semibold">Nama</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 font-semibold">
                    <span className="sr-only">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id} className="border-b border-line/60">
                    <td className="max-w-[260px] truncate py-2 pr-3 font-medium text-navy">{c.email}</td>
                    <td className="py-2 pr-3 text-muted">{[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}</td>
                    <td className="py-2 pr-3">
                      {c.unsubscribed ? <span className="rounded bg-danger-bg px-2 py-0.5 text-[11px] font-semibold text-danger">Unsubscribed</span> : <span className="rounded bg-pale px-2 py-0.5 text-[11px] font-semibold text-navy">Aktif</span>}
                    </td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => setEditing(c)} className="btn-ghost px-2 py-1 text-xs">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && shown.length === 0 && <p className="py-6 text-center text-sm text-muted">Belum ada kontak{filterName ? ` di ${filterName}` : ""}.</p>}
          <div className="mt-4 flex justify-center">
            {loading ? (
              <p className="text-sm text-muted">Memuat…</p>
            ) : (
              next && (
                <button type="button" onClick={() => void load(next)} className="btn-secondary px-4 py-2 text-sm">
                  Muat lagi
                </button>
              )
            )}
          </div>
        </section>
      </div>

      {editing && groups && <ContactEditor contact={editing} groups={groups} onClose={() => setEditing(null)} onChanged={refresh} />}
    </div>
  );
}
