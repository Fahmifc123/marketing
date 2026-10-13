"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { ActiveLogo } from "@/lib/client-image";
import { deleteBrandAsset, getBrandAsset, setBrandAsset } from "@/lib/history-store";
import { DEFAULT_LOGO_CORNER, LOGO_CORNERS, isLogoCorner, type LogoCorner } from "@/lib/logo-placement";

type LogoKind = "primary" | "onDark";
const KEYS = { primary: "logo-primary", onDark: "logo-on-dark" } as const;
const ACCEPTED = ["image/png", "image/webp", "image/jpeg"];
const MAX_BYTES = 5 * 1024 * 1024;

interface Prefs {
  enabled: boolean;
  corner: LogoCorner;
}

export interface BrandLogoState {
  primary: Blob | null;
  onDark: Blob | null;
  enabled: boolean;
  corner: LogoCorner;
  available: boolean;
}

/**
 * Official logo files and auto-logo preferences, saved in this browser
 * (IndexedDB). Returns the logo to composite, or null when auto-logo is off.
 */
export function useBrandLogo() {
  const [state, setState] = useState<BrandLogoState>({
    primary: null,
    onDark: null,
    enabled: false,
    corner: DEFAULT_LOGO_CORNER,
    available: true,
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getBrandAsset<Blob>(KEYS.primary),
      getBrandAsset<Blob>(KEYS.onDark),
      getBrandAsset<Prefs>("logo-prefs"),
    ])
      .then(([primary, onDark, prefs]) => {
        if (cancelled) return;
        setState({
          primary: primary ?? null,
          onDark: onDark ?? null,
          // Default to on as soon as an official logo is saved.
          enabled: prefs ? prefs.enabled : Boolean(primary),
          corner: prefs && isLogoCorner(prefs.corner) ? prefs.corner : DEFAULT_LOGO_CORNER,
          available: true,
        });
      })
      .catch(() => !cancelled && setState((s) => ({ ...s, available: false })));
    return () => {
      cancelled = true;
    };
  }, []);

  function savePrefs(next: Prefs) {
    setBrandAsset("logo-prefs", next).catch(() => {});
  }

  const activeLogo: ActiveLogo | null = useMemo(
    () => (state.enabled && state.primary ? { corner: state.corner, primary: state.primary, onDark: state.onDark } : null),
    [state.enabled, state.primary, state.onDark, state.corner],
  );

  return {
    state,
    activeLogo,
    setEnabled(enabled: boolean) {
      setState((s) => ({ ...s, enabled }));
      savePrefs({ enabled, corner: state.corner });
    },
    setCorner(corner: LogoCorner) {
      setState((s) => ({ ...s, corner }));
      savePrefs({ enabled: state.enabled, corner });
    },
    async saveLogo(kind: LogoKind, file: File) {
      await setBrandAsset(KEYS[kind], file);
      setState((s) => {
        const next = { ...s, [kind]: file as Blob };
        if (kind === "primary" && !s.primary) {
          next.enabled = true;
          savePrefs({ enabled: true, corner: s.corner });
        }
        return next;
      });
    },
    async removeLogo(kind: LogoKind) {
      await deleteBrandAsset(KEYS[kind]);
      setState((s) => ({ ...s, [kind]: null, ...(kind === "primary" ? { enabled: false } : {}) }));
    },
  };
}

type BrandLogo = ReturnType<typeof useBrandLogo>;

function LogoSlot({
  label,
  hint,
  blob,
  dark,
  disabled,
  onUpload,
  onRemove,
}: {
  label: string;
  hint: string;
  blob: Blob | null;
  dark?: boolean;
  disabled?: boolean;
  onUpload: (file: File) => Promise<string | null>;
  onRemove: () => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line p-1.5 ${
          dark ? "bg-navy" : "bg-white"
        }`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
          <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className={`text-[10px] ${dark ? "text-white/60" : "text-muted"}`}>Belum ada</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-navy">{label}</p>
        <p className="text-xs text-muted">{error ? <span className="text-danger">{error}</span> : hint}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <label htmlFor={id} className={`btn-secondary cursor-pointer px-3 py-1.5 text-xs ${disabled ? "pointer-events-none opacity-50" : ""}`}>
          {blob ? "Ganti" : "Upload"}
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept={ACCEPTED.join(",")}
            className="sr-only"
            disabled={disabled}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (inputRef.current) inputRef.current.value = "";
              if (!file) return;
              setError(await onUpload(file));
            }}
          />
        </label>
        {blob && (
          <button type="button" onClick={onRemove} disabled={disabled} className="btn-ghost px-2 py-1.5 text-xs text-muted">
            Hapus
          </button>
        )}
      </div>
    </div>
  );
}

async function validateLogo(file: File): Promise<string | null> {
  if (!ACCEPTED.includes(file.type)) return "Gunakan PNG (transparan), WEBP, atau JPG.";
  if (file.size > MAX_BYTES) return "Maksimal 5 MB.";
  try {
    (await createImageBitmap(file)).close();
  } catch {
    return "File tidak dapat dibaca.";
  }
  return null;
}

/** "Logo resmi" controls: saved logo files, on/off, corner. */
export default function LogoSettings({ logo, disabled }: { logo: BrandLogo; disabled?: boolean }) {
  const cornerId = useId();
  const { state } = logo;

  async function upload(kind: LogoKind, file: File) {
    const problem = await validateLogo(file);
    if (problem) return problem;
    try {
      await logo.saveLogo(kind, file);
      return null;
    } catch {
      return "Gagal menyimpan logo di browser ini.";
    }
  }

  return (
    <fieldset className="rounded-xl border border-line bg-canvas p-4">
      <legend className="sr-only">Logo resmi</legend>
      <div className="flex items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-navy">
          <input
            type="checkbox"
            checked={state.enabled && Boolean(state.primary)}
            onChange={(e) => logo.setEnabled(e.target.checked)}
            disabled={disabled || !state.primary}
            className="h-4 w-4 accent-navy"
          />
          Tempel logo resmi otomatis
        </label>
        {state.primary && (
          <select
            id={cornerId}
            aria-label="Posisi logo"
            value={state.corner}
            onChange={(e) => logo.setCorner(e.target.value as LogoCorner)}
            disabled={disabled || !state.enabled}
            className="select w-auto py-1.5 text-xs"
          >
            {LOGO_CORNERS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        AI tidak menggambar logo. Area di pojok dikosongkan, lalu file logo asli ditempel persis — tidak diubah sama sekali.
      </p>

      {!state.available ? (
        <p className="mt-3 text-xs text-danger">Penyimpanan browser tidak tersedia (mode private?).</p>
      ) : (
        <details className="mt-3" open={!state.primary}>
          <summary className="cursor-pointer text-xs font-semibold text-navy-600 hover:text-navy">
            {state.primary ? "Kelola file logo" : "Upload logo resmi (sekali saja, tersimpan di browser ini)"}
          </summary>
          <div className="mt-3 space-y-3">
            <LogoSlot
              label="Logo utama"
              hint="Untuk latar terang. PNG transparan."
              blob={state.primary}
              disabled={disabled}
              onUpload={(f) => upload("primary", f)}
              onRemove={() => void logo.removeLogo("primary")}
            />
            <LogoSlot
              label="Versi putih (opsional)"
              hint="Dipakai otomatis kalau latar pojoknya gelap."
              blob={state.onDark}
              dark
              disabled={disabled}
              onUpload={(f) => upload("onDark", f)}
              onRemove={() => void logo.removeLogo("onDark")}
            />
          </div>
        </details>
      )}
    </fieldset>
  );
}
