"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

/** Access code form. Validation happens server-side in /api/auth. */
export default function AccessGate() {
  const router = useRouter();
  const inputId = useId();
  const errorId = useId();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!code.trim()) {
      setError("Masukkan access code.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: code }),
      });
      if (res.ok) {
        setCode("");
        router.replace("/dashboard");
        return;
      }
      const data = await res.json().catch(() => null);
      setError(data?.error?.message ?? "Access code tidak valid.");
    } catch {
      setError("Tidak dapat terhubung ke server. Coba lagi.");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="panel p-6 sm:p-8">
      <label htmlFor={inputId} className="label">
        Access Code
      </label>
      <input
        id={inputId}
        name="accessCode"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          if (error) setError(null);
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="field h-12 text-base tracking-wide"
        placeholder="••••••••••••"
      />
      <p id={errorId} role="alert" aria-live="assertive" className="mt-2 min-h-5 text-sm text-danger">
        {error}
      </p>
      <button
        type="submit"
        disabled={submitting}
        className="btn mt-3 h-12 w-full bg-navy text-[15px] tracking-[0.06em] text-white hover:bg-navy-700"
      >
        {submitting ? "CHECKING…" : "ENTER MARKETING KIT"}
        {!submitting && (
          <span aria-hidden="true" className="text-orange">
            →
          </span>
        )}
      </button>
    </form>
  );
}
