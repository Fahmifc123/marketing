"use client";

import { useEffect, useId, useMemo, useState } from "react";

import type { ActiveLogo } from "@/lib/client-image";
import { getBrandAsset, setBrandAsset } from "@/lib/history-store";
import {
  DEFAULT_LOGO_CORNER,
  LOGO_COLORS,
  LOGO_CORNERS,
  LOGO_VARIANTS,
  isLogoColor,
  isLogoCorner,
  isLogoVariant,
  logoFileUrl,
  type LogoColor,
  type LogoCorner,
  type LogoVariant,
} from "@/lib/logo-placement";

interface Prefs {
  enabled: boolean;
  corner: LogoCorner;
  variant: LogoVariant;
  color: LogoColor;
}

const DEFAULT_PREFS: Prefs = { enabled: true, corner: DEFAULT_LOGO_CORNER, variant: "horizontal", color: "auto" };

const blobCache = new Map<string, Promise<Blob>>();
function loadLogo(url: string): Promise<Blob> {
  let p = blobCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error("logo missing");
      return r.blob();
    });
    p.catch(() => blobCache.delete(url));
    blobCache.set(url, p);
  }
  return p;
}

/**
 * Official Intelligo ID logos served from /brand (never uploaded by users).
 * "auto" colour = full-colour logo on light corners, white logo on dark corners.
 */
export function useBrandLogo() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [files, setFiles] = useState<{ primary: Blob; onDark: Blob | null } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBrandAsset<Partial<Prefs>>("logo-prefs-v2")
      .then((saved) => {
        if (cancelled || !saved) return;
        setPrefs({
          enabled: saved.enabled ?? true,
          corner: isLogoCorner(saved.corner) ? saved.corner : DEFAULT_LOGO_CORNER,
          variant: isLogoVariant(saved.variant) ? saved.variant : "horizontal",
          color: isLogoColor(saved.color) ? saved.color : "auto",
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const primaryColor = prefs.color === "auto" ? "color" : prefs.color;
    Promise.all([
      loadLogo(logoFileUrl(prefs.variant, primaryColor)),
      prefs.color === "auto" ? loadLogo(logoFileUrl(prefs.variant, "white")) : Promise.resolve(null),
    ])
      .then(([primary, onDark]) => {
        if (cancelled) return;
        setFiles({ primary, onDark });
        setError(false);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [prefs.variant, prefs.color]);

  function update(patch: Partial<Prefs>) {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      setBrandAsset("logo-prefs-v2", next).catch(() => {});
      return next;
    });
  }

  const activeLogo: ActiveLogo | null = useMemo(
    () => (prefs.enabled && files ? { corner: prefs.corner, primary: files.primary, onDark: files.onDark } : null),
    [prefs.enabled, prefs.corner, files],
  );

  return { prefs, update, activeLogo, error };
}

type BrandLogo = ReturnType<typeof useBrandLogo>;

/** "Logo resmi" controls: on/off, version, colour, corner. Logo files come from the server. */
export default function LogoSettings({ logo, disabled }: { logo: BrandLogo; disabled?: boolean }) {
  const id = useId();
  const { prefs } = logo;
  const off = disabled || !prefs.enabled;

  return (
    <fieldset className="rounded-xl border border-line bg-canvas p-4">
      <legend className="sr-only">Logo resmi</legend>
      <div className="flex items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-navy">
          <input
            type="checkbox"
            checked={prefs.enabled}
            onChange={(e) => logo.update({ enabled: e.target.checked })}
            disabled={disabled}
            className="h-4 w-4 accent-navy"
          />
          Tempel logo resmi otomatis
        </label>
        <select
          aria-label="Posisi logo"
          value={prefs.corner}
          onChange={(e) => logo.update({ corner: e.target.value as LogoCorner })}
          disabled={off}
          className="select w-auto py-1.5 text-xs"
        >
          {LOGO_CORNERS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Logo resmi Intelligo ID dari server. AI tidak menggambar logo — pojoknya dikosongkan, lalu file logo asli ditempel persis.
      </p>

      <div className={`mt-3 space-y-3 ${off ? "opacity-50" : ""}`}>
        <div role="radiogroup" aria-label="Versi logo" className="grid grid-cols-4 gap-1.5">
          {LOGO_VARIANTS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={prefs.variant === v.id}
              disabled={off}
              onClick={() => logo.update({ variant: v.id })}
              className={`flex flex-col items-center gap-1 rounded-lg border bg-white p-1.5 text-[10px] font-semibold transition-colors ${
                prefs.variant === v.id ? "border-navy text-navy ring-1 ring-navy" : "border-line text-muted hover:border-navy-400"
              }`}
            >
              <span className="flex h-8 w-full items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
                <img src={logoFileUrl(v.id, "color")} alt="" className="max-h-full max-w-full object-contain" />
              </span>
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-color`} className="text-xs font-semibold text-navy">
            Warna
          </label>
          <select
            id={`${id}-color`}
            value={prefs.color}
            onChange={(e) => logo.update({ color: e.target.value as LogoColor })}
            disabled={off}
            className="select flex-1 py-1.5 text-xs"
          >
            {LOGO_COLORS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        {logo.error && <p className="text-xs text-danger">File logo tidak bisa dimuat dari server.</p>}
      </div>
    </fieldset>
  );
}
