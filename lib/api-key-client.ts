"use client";

/** Browser helpers for the OpenAI key: the user's own key is optional when the server has one. */
import { useEffect, useState } from "react";

export function apiKeyProblem(key: string, serverKey: boolean): string | null {
  const k = key.trim();
  if (!k) return serverKey ? null : "Masukkan OpenAI API key terlebih dahulu.";
  if (!/^sk-\S{16,}$/.test(k)) return "API key tidak valid. Periksa kembali API key kamu.";
  return null;
}

/** Whether the server has OPENAI_API_KEY configured (false until known). */
export function useServerApiKey(): boolean {
  const [serverKey, setServerKey] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => !cancelled && setServerKey(d?.ok === true && d.serverApiKey === true))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return serverKey;
}
