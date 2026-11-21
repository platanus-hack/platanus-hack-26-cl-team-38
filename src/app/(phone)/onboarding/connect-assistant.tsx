"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { admitSignals, buildAssistantPrompt, IncomingSignalsSchema, parsePastedSignals } from "@/lib/connectors/assistant";
import { SignalSchema, SynthesisSignalSchema, type Kind, type Signal, type SynthesisSignal } from "@/lib/types";

// The signals live on the phone. The server forgets them as soon as the phone collects them, so
// they are saved here before anything else: a reload must not lose them.
const STORAGE_KEY = "team38.signals.v1";
const NONE: Signal[] = [];
let cached: { raw: string | null; signals: Signal[] } = { raw: null, signals: NONE };

function readSignals(): Signal[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage blocked (private mode): the list still works for this visit, from memory.
    return cached.signals;
  }
  if (raw !== cached.raw) {
    let parsed: unknown = [];
    try {
      parsed = raw ? JSON.parse(raw) : [];
    } catch {}
    cached = { raw, signals: z.array(SignalSchema).catch([]).parse(parsed) };
  }
  return cached.signals;
}

function writeSignals(signals: Signal[]) {
  const raw = JSON.stringify(signals);
  cached = { raw, signals };
  try {
    localStorage.setItem(STORAGE_KEY, raw);
  } catch {}
  window.dispatchEvent(new Event(STORAGE_KEY));
}

function subscribe(onChange: () => void) {
  window.addEventListener(STORAGE_KEY, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(STORAGE_KEY, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const keyOf = (signal: Pick<Signal, "source" | "kind" | "label">) => `${signal.source}:${signal.kind}:${signal.label}`;

function addSignals(arrived: SynthesisSignal[]) {
  const merged = new Map(readSignals().map((signal) => [keyOf(signal), signal]));
  for (const signal of arrived) merged.set(keyOf(signal), { ...signal, evidence: "" });
  writeSignals([...merged.values()]);
}

const KIND_LABEL: Record<Kind, string> = {
  es: "Soy",
  sabe: "Sé",
  hace: "Hago",
  le_gusta: "Me gusta",
  quiere_ser: "Quiero ser",
  busca: "Busco",
  ofrece: "Ofrezco",
};

type Ticket = { inbox: string; expiresAt: number };

export function ConnectAssistant() {
  const signals = useSyncExternalStore(subscribe, readSignals, () => NONE);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("");
  const [now, setNow] = useState(0);
  const [pasted, setPasted] = useState("");
  const [pasteStatus, setPasteStatus] = useState("");

  useEffect(() => {
    if (!ticket) return;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      const response = await fetch("/api/onboarding/inbox", { method: "POST", body: JSON.stringify({ inbox: ticket.inbox }) }).catch(() => null);
      if (!response) return; // offline for a moment: try again on the next tick
      if (!response.ok) return setTicket(null);
      const arrived = z.array(SynthesisSignalSchema).catch([]).parse((await response.json()).signals);
      if (arrived.length > 0) addSignals(arrived);
    }, 2000);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
    };
  }, [ticket]);

  async function copyMessage() {
    setStatus("Preparando el mensaje…");
    const message = fetch("/api/onboarding/token", { method: "POST" }).then(async (response) => {
      if (!response.ok) throw new Error("token");
      const { token, inbox, expiresAt } = await response.json();
      setTicket({ inbox, expiresAt });
      setNow(Date.now());
      const text = buildAssistantPrompt({ origin: window.location.origin, token });
      setPrompt(text);
      return text;
    });
    try {
      // Safari only keeps the tap's permission to copy if the clipboard call starts before the
      // request resolves, so it gets the pending text instead of waiting for it.
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": message.then((text) => new Blob([text], { type: "text/plain" })) })]);
      } else {
        await navigator.clipboard.writeText(await message);
      }
      setStatus("Copiado. Pégalo en tu asistente.");
    } catch {
      const ready = await message.then(() => true, () => false);
      setStatus(ready ? "No se pudo copiar solo. Abre “Ver el mensaje” y cópialo a mano." : "No se pudo preparar el mensaje. Revisa tu conexión e intenta de nuevo.");
    }
  }

  // Stays on the phone: the same checks the server runs, without sending anything.
  function loadPasted() {
    const parsed = IncomingSignalsSchema.safeParse(parsePastedSignals(pasted));
    if (!parsed.success) return setPasteStatus("No pude leer ese texto. Copia el bloque completo, desde el [ hasta el ].");
    const { accepted, held } = admitSignals(parsed.data);
    addSignals(accepted);
    setPasted("");
    setPasteStatus(`Cargué ${accepted.length} temas.${held ? ` Dejé fuera ${held} que parecían datos sensibles.` : ""}`);
  }

  const secondsLeft = ticket ? Math.round((ticket.expiresAt - now) / 1000) : 0;

  return (
    <>
      <section className="flex flex-col gap-3">
        <Button size="lg" onClick={copyMessage}>
          {ticket ? "Copiar un mensaje nuevo" : "Copiar mensaje"}
        </Button>
        <p role="status" className="text-sm text-muted-foreground">
          {status}
          {ticket && secondsLeft > 0 && ` Sirve por ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")} más.`}
          {ticket && now > 0 && secondsLeft <= 0 && " El mensaje venció: copia uno nuevo."}
        </p>
        {prompt && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Ver el mensaje</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap select-all">{prompt}</pre>
          </details>
        )}
        <p className="text-sm text-muted-foreground">
          En un chat, tu asistente te responde con un enlace: tócalo y vuelve aquí. En Claude Code lo envía solo. Puedes pegar el mismo mensaje en más de un asistente.
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Mi asistente me dio el perfil como texto</summary>
          <label className="mt-2 flex flex-col gap-1">
            <span className="text-muted-foreground">Pega aquí lo que te respondió.</span>
            <textarea
              value={pasted}
              onChange={(event) => {
                setPasted(event.target.value);
                setPasteStatus("");
              }}
              rows={5}
              spellCheck={false}
              className="rounded-lg border bg-background p-2 font-mono text-xs"
            />
          </label>
          <Button variant="outline" className="mt-2 w-full" onClick={loadPasted}>
            Cargar
          </Button>
          <p role="status" className="mt-1 text-muted-foreground">
            {pasteStatus}
          </p>
        </details>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Lo que llegó{signals.length > 0 && ` (${signals.length})`}</h2>
        {signals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no llega nada. Cuando tu asistente termine, tus temas aparecen aquí.</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y">
              {signals.map((signal) => (
                <li key={keyOf(signal)} className="flex items-center gap-2 py-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{signal.label}</span>
                    <span className="flex gap-1.5">
                      <Badge variant="secondary">{KIND_LABEL[signal.kind]}</Badge>
                      <Badge variant="outline">{signal.source}</Badge>
                    </span>
                  </span>
                  <Button variant="ghost" size="sm" aria-label={`Quitar ${signal.label}`} onClick={() => writeSignals(readSignals().filter((other) => keyOf(other) !== keyOf(signal)))}>
                    Quitar
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">Nada de esto es público. Quedó guardado solo en este teléfono, y lo que quites no se publica.</p>
          </>
        )}
      </section>
    </>
  );
}
