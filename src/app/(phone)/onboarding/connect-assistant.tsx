"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { admitSignals, buildAssistantPrompt, IncomingSignalsSchema, parsePastedSignals, type ClassifySignals } from "@/lib/connectors/assistant";
import { SynthesisSignalSchema, type Signal } from "@/lib/types";
import { addSignals, writeSignals } from "./store";

// Pasted text goes through the same privacy filter as the other two ways in. Only kind and name
// travel to the server, as in the rest of the onboarding.
const classifyOnApi: ClassifySignals = async (topics) => {
  const response = await fetch("/api/privacy/classify", { method: "POST", body: JSON.stringify({ topics }) });
  if (!response.ok) throw new Error("classify");
  const { verdicts } = z.object({ verdicts: z.array(z.object({ level: z.enum(["segura", "personal", "sensible"]) })) }).parse(await response.json());
  return verdicts.map((privacy) => ({ privacy }));
};

type Ticket = { token: string; inbox: string; expiresAt: number };
// A ticket with less than this left gets replaced, so the assistant has time to answer.
const MIN_LEFT_MS = 3 * 60_000;

// Lives in the flow, not in step 1: the phone keeps collecting while the person reviews.
export function useAssistantInbox() {
  const [ticket, setTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    if (!ticket) return;
    const poll = setInterval(async () => {
      const response = await fetch("/api/onboarding/inbox", { method: "POST", body: JSON.stringify({ inbox: ticket.inbox }) }).catch(() => null);
      if (!response) return; // offline for a moment: try again on the next tick
      if (!response.ok) return setTicket(null);
      const arrived = z.array(SynthesisSignalSchema).catch([]).parse((await response.json()).signals);
      if (arrived.length > 0) addSignals(arrived);
    }, 2000);
    return () => clearInterval(poll);
  }, [ticket]);

  // The token works several times inside its window, so Claude and ChatGPT share one message.
  async function liveToken(): Promise<string> {
    if (ticket && ticket.expiresAt - Date.now() >= MIN_LEFT_MS) return ticket.token;
    const response = await fetch("/api/onboarding/token", { method: "POST" });
    if (!response.ok) throw new Error("token");
    const fresh = (await response.json()) as Ticket;
    setTicket(fresh);
    return fresh.token;
  }

  const message = async () => buildAssistantPrompt({ origin: window.location.origin, token: await liveToken() });

  return { message };
}

export type AssistantInbox = ReturnType<typeof useAssistantInbox>;

function useCopy(message: () => Promise<string>, pasteInto: string) {
  const [status, setStatus] = useState("");
  const [text, setText] = useState("");

  async function copy() {
    setStatus("Preparando el mensaje…");
    const pending = message().then((prompt) => {
      setText(prompt);
      return prompt;
    });
    try {
      // Safari only keeps the tap's permission to copy if the clipboard call starts before the
      // request resolves, so it gets the pending text instead of waiting for it.
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": pending.then((t) => new Blob([t], { type: "text/plain" })) })]);
      } else {
        await navigator.clipboard.writeText(await pending);
      }
      setStatus(`Copiado. Pégalo en ${pasteInto}.`);
    } catch {
      const ready = await pending.then(() => true, () => false);
      setStatus(ready ? "No se pudo copiar solo. Abre “Ver el mensaje” y cópialo a mano." : "No se pudo preparar el mensaje. Revisa tu conexión e intenta de nuevo.");
    }
  }

  return { status, text, copy };
}

function MessagePreview({ text }: { text: string }) {
  if (!text) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">Ver el mensaje</summary>
      <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap select-all">{text}</pre>
    </details>
  );
}

type Assistant = "claude" | "chatgpt";

const ASSISTANTS: Record<Assistant, { name: string; url: string; steps: string[] }> = {
  claude: {
    name: "Claude",
    url: "https://claude.ai/new",
    steps: [
      "Pégalo en claude.ai (mejor con la memoria activada) o en Claude Code abierto en tus proyectos.",
      "Claude Code lo envía solo. En el chat te responde con un enlace: tócalo y vuelve aquí.",
    ],
  },
  chatgpt: {
    name: "ChatGPT",
    url: "https://chatgpt.com/",
    steps: [
      "Pégalo en un chat nuevo de ChatGPT. Sirve más si tienes la memoria activada (Ajustes → Personalización).",
      "Te responde con un enlace: tócalo y vuelve aquí.",
    ],
  },
};

function AssistantCard({ assistant, arrived, message }: { assistant: Assistant; arrived: number; message: () => Promise<string> }) {
  const { name, url, steps } = ASSISTANTS[assistant];
  const { status, text, copy } = useCopy(message, name);

  return (
    <section className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{name}</h3>
        {arrived > 0 && <Badge variant="secondary">Llegaron {arrived}</Badge>}
      </div>
      <ol className="list-decimal pl-5 text-sm text-muted-foreground">
        <li>Copia el mensaje.</li>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={copy}>
          Copiar mensaje para {name}
        </Button>
        <a href={url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
          Abrir {name}
        </a>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {status}
      </p>
      <MessagePreview text={text} />
    </section>
  );
}

function PasteFallback() {
  const [pasted, setPasted] = useState("");
  const [status, setStatus] = useState("");

  async function load() {
    const parsed = IncomingSignalsSchema.safeParse(parsePastedSignals(pasted));
    if (!parsed.success) return setStatus("No pude leer ese texto. Copia el bloque completo, desde el [ hasta el ].");
    setStatus("Revisando que no haya datos sensibles…");
    try {
      const { accepted, held } = await admitSignals(parsed.data, classifyOnApi);
      addSignals(accepted);
      setPasted("");
      setStatus(`Cargué ${accepted.length} temas.${held ? ` Dejé fuera ${held} por ser datos sensibles.` : ""}`);
    } catch {
      // Without the filter nothing is loaded: better to ask again than to keep something unreviewed.
      setStatus("No pude revisar la privacidad ahora, así que no cargué nada. Intenta de nuevo.");
    }
  }

  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">Mi asistente me dio el perfil como texto</summary>
      <label className="mt-2 flex flex-col gap-1">
        <span className="text-muted-foreground">Pega aquí lo que te respondió.</span>
        <textarea
          value={pasted}
          onChange={(event) => {
            setPasted(event.target.value);
            setStatus("");
          }}
          rows={5}
          spellCheck={false}
          className="rounded-lg border bg-background p-2 font-mono text-xs"
        />
      </label>
      <Button variant="outline" className="mt-2 w-full" onClick={load}>
        Cargar
      </Button>
      <p role="status" className="mt-1 text-muted-foreground">
        {status}
      </p>
    </details>
  );
}

export function ConnectAssistant({ signals, inbox }: { signals: Signal[]; inbox: AssistantInbox }) {
  const from = (source: Signal["source"]) => signals.filter((s) => s.source === source).length;
  return (
    <div className="flex flex-col gap-4">
      <AssistantCard assistant="claude" arrived={from("claude")} message={inbox.message} />
      <AssistantCard assistant="chatgpt" arrived={from("chatgpt")} message={inbox.message} />
      <p className="text-sm text-muted-foreground">
        Puedes usar los dos: lo que se repite cuenta más. ¿Usas Gemini? El mismo mensaje sirve. Antes de guardar, todo pasa por el filtro de privacidad y lo sensible
        (salud, pareja, dinero, política…) se descarta.
      </p>
      <PasteFallback />
      {signals.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Llegaron {signals.length} temas. Nada es público todavía.{" "}
          <button type="button" className="underline underline-offset-4" onClick={() => writeSignals([])}>
            Borrar y empezar de nuevo
          </button>
        </p>
      )}
    </div>
  );
}
