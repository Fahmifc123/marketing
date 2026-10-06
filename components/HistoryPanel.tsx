"use client";

import type { HistoryItem } from "@/types/image";

interface Props {
  items: HistoryItem[];
  available: boolean;
  activeId: string | null;
  busy?: boolean;
  onOpen: (item: HistoryItem) => void;
  onRegenerate: (item: HistoryItem) => void;
  onDownload: (item: HistoryItem) => void;
  onDelete: (item: HistoryItem) => void;
}

function formatTime(ts: number) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(ts);
}

export default function HistoryPanel({ items, available, activeId, busy, onOpen, onRegenerate, onDownload, onDelete }: Props) {
  return (
    <section aria-labelledby="history-heading" className="mt-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 id="history-heading" className="eyebrow">
          Recent Creations
        </h3>
        {items.length > 0 && <span className="text-xs text-muted">Disimpan di browser ini</span>}
      </div>

      {!available ? (
        <p className="text-sm text-muted">History tidak tersedia di browser ini (mis. mode private).</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">Belum ada creative. Hasil generate akan muncul di sini.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={`flex gap-3 rounded-xl border bg-white p-2.5 transition-colors ${
                item.id === activeId ? "border-navy-400" : "border-line"
              }`}
            >
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="shrink-0 overflow-hidden rounded-lg border border-line bg-canvas"
                aria-label={`Open: ${item.prompt}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local data URL thumbnail */}
                <img src={item.thumbnail} alt="" className="h-16 w-16 object-cover" />
              </button>
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="line-clamp-2 text-sm leading-snug text-navy" title={item.prompt}>
                  {item.prompt}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {item.carousel && (
                    <span className="mr-1 font-semibold text-navy">
                      Slide {item.carousel.index}/{item.carousel.total} · {item.carousel.role} ·
                    </span>
                  )}
                  {formatTime(item.createdAt)} · {item.aspectRatio} · {item.quality}
                </p>
                <div className="mt-auto flex flex-wrap gap-x-3 pt-1 text-xs font-semibold">
                  <button type="button" onClick={() => onOpen(item)} className="text-navy-600 hover:text-navy">
                    Open
                  </button>
                  {!item.carousel && (
                    <button
                      type="button"
                      onClick={() => onRegenerate(item)}
                      disabled={busy}
                      className="text-navy-600 hover:text-navy disabled:opacity-40"
                    >
                      Regenerate
                    </button>
                  )}
                  <button type="button" onClick={() => onDownload(item)} className="text-navy-600 hover:text-navy">
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(item)}
                    className="text-muted hover:text-danger"
                    aria-label={`Delete: ${item.prompt}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
