"use client";

import { useState } from "react";

import { CsvPicker, GroupChecklist, useGroups } from "@/components/EmailDatabase";
import { parseEmailList, type ParsedRow } from "@/lib/contacts";
import { api, jsonInit, waitForImport } from "@/lib/email-api-client";

export interface PreparedAudience {
  id: string;
  name: string;
  recipients: number;
  capped: boolean;
}

type Mode = "groups" | "csv" | "manual";

/**
 * Chooses who receives the broadcast: categories/tags from the database, a CSV,
 * or typed addresses. Anything but a single category/tag is merged into a
 * one-off send list first; the result is one Resend segment to broadcast.
 */
export default function RecipientPicker({
  label,
  disabled,
  value,
  onChange,
}: {
  label: string;
  disabled?: boolean;
  value: PreparedAudience | null;
  onChange: (a: PreparedAudience | null) => void;
}) {
  const { groups, error: groupsError, reload } = useGroups(true);
  const [mode, setMode] = useState<Mode>("groups");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [csv, setCsv] = useState<{ rows: ParsedRow[]; name: string } | null>(null);
  const [typed, setTyped] = useState("");
  const [saveTo, setSaveTo] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const typedParsed = parseEmailList(typed);

  function reset() {
    onChange(null);
    setError(null);
  }

  async function prepare() {
    setError(null);
    onChange(null);
    const rows = mode === "csv" ? (csv?.rows ?? []) : mode === "manual" ? typedParsed.rows : [];
    const ids = mode === "groups" ? groupIds : [];
    if (!rows.length && !ids.length) return setError("Belum ada penerima yang dipilih.");
    if (mode === "manual" && typedParsed.invalid.length) return setError(`Email tidak valid: ${typedParsed.invalid.slice(0, 3).join(", ")}`);

    // One category/tag: broadcast to it directly.
    if (mode === "groups" && ids.length === 1) {
      const g = groups?.find((x) => x.id === ids[0]);
      if (g) return onChange({ id: g.id, name: g.name, recipients: g.recipients, capped: g.capped });
    }

    try {
      setBusy("Menyiapkan daftar penerima…");
      const built = await api<{ segmentId: string; importId: string; total: number }>(
        "/api/email/send-list",
        jsonInit("POST", { label, groupIds: ids, rows, saveToGroupIds: mode === "groups" ? [] : saveTo }),
      );
      const res = await waitForImport(built.importId, () => setBusy("Resend memproses daftar penerima…"));
      if (res.status === "failed") throw new Error("Resend gagal memproses daftar penerima.");
      const count = await api<{ recipients: number; capped: boolean }>(`/api/email/send-list?segmentId=${encodeURIComponent(built.segmentId)}`);
      const names =
        mode === "groups"
          ? (groups ?? []).filter((g) => ids.includes(g.id)).map((g) => g.name).join(" + ")
          : mode === "csv"
            ? (csv?.name ?? "CSV")
            : `${rows.length} email diketik`;
      onChange({ id: built.segmentId, name: names, recipients: count.recipients, capped: count.capped });
      if (saveTo.length) void reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const locked = disabled || Boolean(busy);

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Sumber penerima" className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-white p-1 text-sm font-semibold">
        {(
          [
            ["groups", "Kategori / Tag"],
            ["csv", "Upload CSV"],
            ["manual", "Ketik email"],
          ] as const
        ).map(([m, text]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            disabled={locked}
            onClick={() => {
              setMode(m);
              reset();
            }}
            className={`rounded-md px-2 py-1.5 ${mode === m ? "bg-navy text-white" : "text-navy hover:bg-pale"}`}
          >
            {text}
          </button>
        ))}
      </div>

      {mode === "groups" &&
        (groupsError ? (
          <p role="alert" className="text-sm text-danger">{groupsError}</p>
        ) : groups ? (
          <>
            <GroupChecklist groups={groups} value={groupIds} onChange={(v) => (setGroupIds(v), reset())} disabled={locked} showCounts />
            <p className="text-xs text-muted">Pilih lebih dari satu untuk menggabungkan — email yang sama hanya dikirim sekali.</p>
          </>
        ) : (
          <p className="text-sm text-muted">Memuat kategori &amp; tag…</p>
        ))}

      {mode === "csv" && <CsvPicker onRows={(r) => (setCsv(r), reset())} disabled={locked} />}

      {mode === "manual" && (
        <div>
          <textarea
            value={typed}
            onChange={(e) => (setTyped(e.target.value), reset())}
            rows={4}
            disabled={locked}
            placeholder={"nama@contoh.com, rekan@kantor.co.id\natau satu email per baris"}
            aria-label="Email penerima"
            className="field resize-y py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted">
            {typedParsed.rows.length} email valid{typedParsed.invalid.length ? ` · ${typedParsed.invalid.length} tidak valid` : ""}
          </p>
        </div>
      )}

      {mode !== "groups" && groups && groups.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-navy-600">Simpan juga email ini ke kategori/tag (opsional)</summary>
          <div className="mt-2">
            <GroupChecklist groups={groups} value={saveTo} onChange={setSaveTo} disabled={locked} />
          </div>
        </details>
      )}

      {!value && (
        <button type="button" onClick={() => void prepare()} disabled={locked} className="btn-secondary w-full py-2 text-sm">
          {busy ?? "Siapkan penerima"}
        </button>
      )}
      {value && (
        <p className="flex items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm text-navy">
          <span className="min-w-0 truncate">
            Penerima: <strong>{value.name}</strong>
          </span>
          <button type="button" onClick={reset} disabled={disabled} className="btn-ghost shrink-0 px-2 py-0.5 text-xs">
            Ganti
          </button>
        </p>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <p className="text-[11px] text-muted">Email dari CSV / ketik ikut tersimpan di Database Email. Kontak yang sudah unsubscribe tidak akan dikirimi.</p>
    </div>
  );
}
