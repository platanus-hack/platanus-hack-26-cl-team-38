"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const FIELDS = [
  "client_id",
  "redirect_uri",
  "response_type",
  "code_challenge",
  "code_challenge_method",
  "state",
] as const;

// Minga's own state on this browser, read without creating one (see (phone)/_lib/store.ts).
const PHONE_KEY = "nodo.phone.v1";
const noSubscription = () => () => {};

function phoneHere(stored: string | null): { deviceKey: string; displayName: string } | null {
  try {
    const raw = JSON.parse(stored ?? "null") as { deviceKey?: unknown; displayName?: unknown } | null;
    if (typeof raw?.deviceKey !== "string" || raw.deviceKey.length < 32) return null;
    return { deviceKey: raw.deviceKey, displayName: typeof raw.displayName === "string" ? raw.displayName : "" };
  } catch {
    return null;
  }
}

export function AuthorizeForm() {
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const stored = useSyncExternalStore(
    noSubscription,
    () => localStorage.getItem(PHONE_KEY),
    () => null,
  );
  const here = useMemo(() => phoneHere(stored), [stored]);

  async function submit(phoneCode: string) {
    setBusy(true);
    setError(undefined);
    const request = Object.fromEntries(FIELDS.flatMap((f) => (params.get(f) === null ? [] : [[f, params.get(f)]])));
    const response = await fetch("/api/oauth/authorize", {
      method: "POST",
      body: JSON.stringify({ ...request, code: phoneCode }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { redirect?: string; error?: string } | null;
    if (body?.redirect) return window.location.assign(body.redirect);
    setError(body?.error ?? "No pudimos conectar. Revisa tu conexión e intenta de nuevo.");
    setBusy(false);
  }

  // Minga is open in this same browser: the code can be asked for and used in one step.
  async function asThisBrowser() {
    if (!here) return;
    setBusy(true);
    const response = await fetch("/api/oauth/code", {
      method: "POST",
      headers: { authorization: `Bearer ${here.deviceKey}` },
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { code?: string } | null;
    if (body?.code) return submit(body.code);
    setError("No pudimos conectar. Intenta con el código de tu teléfono.");
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {here && (
        <>
          <Button size="lg" disabled={busy} onClick={asThisBrowser}>
            Conectar como {here.displayName || "este navegador"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">o con el código de otro teléfono</p>
        </>
      )}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) void submit(code);
        }}
      >
        <label className="flex flex-col gap-2 text-sm">
          <span>
            Abre Minga en tu teléfono, ve a <b>Perfil → Conectar asistente</b> y escribe aquí el código que aparece.
          </span>
          <input
            className="rounded-lg border bg-background px-3 py-3 text-center font-mono text-2xl tracking-widest uppercase"
            value={code}
            onChange={(e) => (setCode(e.target.value), setError(undefined))}
            placeholder="ABCD-EFGH"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            aria-label="Código de tu teléfono"
          />
        </label>
        <Button type="submit" size="lg" variant={here ? "outline" : "default"} disabled={busy || !code.trim()}>
          {busy ? "Conectando…" : "Conectar"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
