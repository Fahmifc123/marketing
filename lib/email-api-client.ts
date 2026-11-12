/** Small fetch wrapper for the email routes: throws Error(message) with `code`, redirects on expired session. */
interface ApiError {
  ok: false;
  error: { code: string; message: string };
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => null)) as (T & { ok: true }) | ApiError | null;
  if (!data) throw new Error("Server tidak merespons dengan benar. Coba lagi.");
  if (!data.ok) {
    if (data.error.code === "unauthorized") window.location.replace("/login");
    throw Object.assign(new Error(data.error.message), { code: data.error.code });
  }
  return data;
}

export const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Polls a Resend contact import until it finishes. */
export async function waitForImport(importId: string, onTick?: (status: string) => void): Promise<{ status: string; counts: Record<string, number> }> {
  for (let i = 0; i < 120; i++) {
    const s = await api<{ status: string; counts: Record<string, number> }>(`/api/email/contacts/import?id=${encodeURIComponent(importId)}`);
    onTick?.(s.status);
    if (s.status === "completed" || s.status === "failed") return s;
    await new Promise((r) => setTimeout(r, i < 5 ? 1500 : 3000));
  }
  throw new Error("Import masih berjalan lama. Cek lagi sebentar.");
}

export interface GroupItem {
  id: string;
  type: "category" | "tag";
  name: string;
  recipients: number;
  capped: boolean;
}
