"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DemoLoginButton({ className = "button secondary", label = "Open the demo ledger" }: { className?: string; label?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enterDemo() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/demo", { method: "POST", headers: { "content-type": "application/json" } });
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) {
        setError(body?.error?.message ?? "The demo is unavailable right now.");
        return;
      }
      router.push("/groups");
      router.refresh();
    } catch {
      setError("The demo is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-stack">
      <button type="button" className={className} onClick={enterDemo} disabled={loading}>
        {loading ? "Opening demo..." : label}
      </button>
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
