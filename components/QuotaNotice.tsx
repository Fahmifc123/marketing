"use client";

export interface QuotaInfo {
  quota: {
    dailyUsed: number;
    dailyLimit: number | null;
    dailyResetsAt: string;
    monthlyUsed: number;
    monthlyLimit: number;
  } | null;
  remaining: number | null;
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) + " WIB";

/** Shows the Resend sending quota and warns when the selection exceeds it. */
export default function QuotaNotice({ info, recipients }: { info: QuotaInfo | null; recipients: number | null }) {
  if (!info?.quota) return null;
  const { quota, remaining } = info;
  const over = recipients !== null && remaining !== null && recipients > remaining;
  return (
    <div className={`rounded-lg border px-3 py-2.5 text-xs ${over ? "border-orange bg-orange/10 text-navy" : "border-line bg-white text-muted"}`} role={over ? "alert" : undefined}>
      <p>
        Kuota kirim Resend — hari ini:{" "}
        <strong className="text-navy">
          {quota.dailyUsed}/{quota.dailyLimit ?? "∞"}
        </strong>
        {" · "}bulan ini:{" "}
        <strong className="text-navy">
          {quota.monthlyUsed}/{quota.monthlyLimit}
        </strong>
        {remaining !== null && (
          <>
            {" · "}sisa <strong className="text-navy">{remaining}</strong> email
          </>
        )}
      </p>
      {over && (
        <p className="mt-1 font-semibold">
          ⚠ Penerima ({recipients}) melebihi sisa kuota ({remaining}). Hanya {remaining} email pertama yang akan terkirim, sisanya gagal.
          {quota.dailyLimit !== null && ` Kuota harian reset ${fmtTime(quota.dailyResetsAt)}.`} Kurangi penerima, kirim bertahap, atau upgrade paket Resend.
        </p>
      )}
    </div>
  );
}
