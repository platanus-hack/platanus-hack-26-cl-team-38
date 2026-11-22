"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  admitSignals,
  APP_NAME,
  buildAssistantPrompt,
  IncomingSignalsSchema,
  parsePastedSignals,
  type ClassifySignals,
} from "@/lib/connectors/assistant";
import { buildProfilePrompt, PROFILE_MAX_CHARS } from "@/lib/connectors/profile";
import { SynthesisSignalSchema, type Signal, type SynthesisSignal } from "@/lib/types";
import { addProfiles, addSignals, ProfilesSchema, removeProfileLine, writeSignals, type Profile } from "./store";

// Pasted text goes through the same privacy filter as the other two ways in. Only kind and name
// travel to the server, as in the rest of the onboarding.
export const classifyOnApi: ClassifySignals = async (topics) => {
  const response = await fetch("/api/privacy/classify", { method: "POST", body: JSON.stringify({ topics }) });
  if (!response.ok) throw new Error("classify");
  const { verdicts } = z
    .object({ verdicts: z.array(z.object({ level: z.enum(["segura", "personal", "sensible"]) })) })
    .parse(await response.json());
  return verdicts.map((privacy) => ({ privacy }));
};

type Ticket = { token: string; inbox: string; expiresAt: number };
// A ticket with less than this left gets replaced, so the assistant has time to answer.
const MIN_LEFT_MS = 3 * 60_000;

// Where collected signals and profiles go. /onboarding keeps them in its own store; Minga passes its own.
export type InboxSink = { onSignals: (arrived: SynthesisSignal[]) => void; onProfiles: (arrived: Profile[]) => void };
const ONBOARDING_SINK: InboxSink = { onSignals: addSignals, onProfiles: addProfiles };

// Lives in the flow, not in step 1: the phone keeps collecting while the person reviews.
// `sink` must be stable (a module constant), or polling restarts on every render.
export function useAssistantInbox({ onSignals, onProfiles }: InboxSink = ONBOARDING_SINK) {
  const [ticket, setTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    if (!ticket) return;
    const poll = setInterval(async () => {
      const response = await fetch("/api/onboarding/inbox", {
        method: "POST",
        body: JSON.stringify({ inbox: ticket.inbox }),
      }).catch(() => null);
      if (!response) return; // offline for a moment: try again on the next tick
      if (!response.ok) return setTicket(null);
      const body = await response.json();
      const arrived = z.array(SynthesisSignalSchema).catch([]).parse(body.signals);
      if (arrived.length > 0) onSignals(arrived);
      const profiles = ProfilesSchema.catch([]).parse(body.profiles);
      if (profiles.length > 0) onProfiles(profiles);
    }, 2000);
    return () => clearInterval(poll);
  }, [ticket, onSignals, onProfiles]);

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
  const profileMessage = async () => buildProfilePrompt({ origin: window.location.origin, token: await liveToken() });

  // The file the person got from a chat goes in through the same door as an assistant's upload, so
  // it gets the same filter; what passes comes back through the inbox.
  async function uploadProfile(source: Profile["source"], markdown: string): Promise<string> {
    const response = await fetch(`/api/onboarding/profile?source=${source}`, {
      method: "POST",
      headers: { authorization: `Bearer ${await liveToken()}`, "content-type": "text/markdown" },
      body: markdown,
    });
    return response.text();
  }

  return { message, profileMessage, uploadProfile };
}

export type AssistantInbox = ReturnType<typeof useAssistantInbox>;

export function useCopy(message: () => Promise<string>, pasteInto: string) {
  const [status, setStatus] = useState("");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  async function copy() {
    setCopied(false);
    setStatus("Preparando el mensaje…");
    const pending = message().then((prompt) => {
      setText(prompt);
      return prompt;
    });
    try {
      // Safari only keeps the tap's permission to copy if the clipboard call starts before the
      // request resolves, so it gets the pending text instead of waiting for it.
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ "text/plain": pending.then((t) => new Blob([t], { type: "text/plain" })) }),
        ]);
      } else {
        await navigator.clipboard.writeText(await pending);
      }
      setStatus(`Copiado. Pégalo en ${pasteInto}.`);
      setCopied(true);
    } catch {
      const ready = await pending.then(
        () => true,
        () => false,
      );
      setStatus(
        ready
          ? "No se pudo copiar solo. Abre “Ver el mensaje” y cópialo a mano."
          : "No se pudo preparar el mensaje. Revisa tu conexión e intenta de nuevo.",
      );
    }
  }

  return { status, text, copy, copied };
}

function MessagePreview({ text }: { text: string }) {
  if (!text) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">Ver el mensaje</summary>
      <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap select-all">
        {text}
      </pre>
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

function AssistantCard({
  assistant,
  arrived,
  message,
}: {
  assistant: Assistant;
  arrived: number;
  message: () => Promise<string>;
}) {
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

const PROFILE_SOURCES = [
  ["claude", "Claude"],
  ["chatgpt", "ChatGPT"],
  ["gemini", "Gemini"],
] as const;

// Proof of concept: signals are a few words each; this brings the detail an agent needs to plan
// with a group, as a markdown file the assistant writes.
function DetailedProfile({
  profiles,
  inbox,
}: {
  profiles: Profile[];
  inbox: Pick<AssistantInbox, "profileMessage" | "uploadProfile">;
}) {
  const { status: copyStatus, text, copy } = useCopy(inbox.profileMessage, "tu asistente");
  const [source, setSource] = useState<(typeof PROFILE_SOURCES)[number][0]>("claude");
  const [pasted, setPasted] = useState("");
  const [status, setStatus] = useState("");

  async function upload(markdown: string) {
    if (markdown.trim() === "") return;
    if (markdown.length > PROFILE_MAX_CHARS)
      return setStatus("El archivo es muy largo. Pídele a tu asistente una versión más corta.");
    setStatus("Revisando que no haya datos sensibles…");
    try {
      setStatus(await inbox.uploadProfile(source, markdown));
      setPasted("");
    } catch {
      setStatus("No se pudo subir. Revisa tu conexión e intenta de nuevo.");
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border p-4">
      <h3 className="font-medium">Perfil detallado</h3>
      <p className="text-sm text-muted-foreground">
        Tu asistente escribe un archivo con tus gustos y tu forma de planear, para que tu agente te represente en un
        grupo. Claude Code lo sube solo. Desde el chat te entrega el archivo y lo subes aquí. Pasa línea por línea por
        el filtro de privacidad.
      </p>
      <Button onClick={copy}>Copiar mensaje del perfil detallado</Button>
      <p role="status" className="text-sm text-muted-foreground">
        {copyStatus}
      </p>
      <MessagePreview text={text} />

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Subir el archivo que me dio mi asistente</summary>
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">Viene de</span>
            <select
              value={source}
              onChange={(event) => setSource(event.target.value as typeof source)}
              className="rounded-lg border bg-background p-1"
            >
              {PROFILE_SOURCES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <input
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            aria-label="Archivo del perfil"
            className="text-xs"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) await upload(await file.text());
            }}
          />
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">O pega aquí su contenido.</span>
            <textarea
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              rows={5}
              spellCheck={false}
              className="rounded-lg border bg-background p-2 font-mono text-xs"
            />
          </label>
          <Button variant="outline" onClick={() => upload(pasted)}>
            Subir
          </Button>
        </div>
      </details>
      <p role="status" className="text-sm text-muted-foreground">
        {status}
      </p>

      {profiles.map((profile) => (
        <details key={profile.source} className="text-sm">
          <summary className="cursor-pointer font-medium">
            Llegó de {PROFILE_SOURCES.find(([value]) => value === profile.source)?.[1] ?? profile.source}:{" "}
            {profile.markdown.split("\n").filter((line) => line.startsWith("- ")).length} líneas
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {profile.markdown.split("\n").map((line, i) =>
              line.trim() === "" ? null : (
                <li
                  key={`${i}:${line}`}
                  className={`flex items-start justify-between gap-2 ${line.startsWith("#") ? "mt-2 font-medium" : "text-muted-foreground"}`}
                >
                  <span>{line.replace(/^(?:#+|-)\s+/, "")}</span>
                  <button
                    type="button"
                    aria-label={`Quitar: ${line}`}
                    className="shrink-0 underline underline-offset-4"
                    onClick={() => removeProfileLine(profile.source, i)}
                  >
                    Quitar
                  </button>
                </li>
              ),
            )}
          </ul>
        </details>
      ))}
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

// The chat cannot reach our API from its sandbox; a connector can. Added once per account, from the
// web or the desktop app, and after that the same messages deliver on their own, on the phone too.
function ConnectorSetup() {
  const url = `${window.location.origin}/api/mcp`;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">Que Claude lo envíe solo desde el chat</summary>
      <ol className="mt-2 list-decimal pl-5 text-muted-foreground">
        <li>En claude.ai, desde el computador: Settings → Connectors → Add custom connector.</li>
        <li>
          Ponle de nombre {APP_NAME} y pega esta dirección: <code className="break-all select-all">{url}</code>
        </li>
        <li>Actívalo en el chat y pega el mensaje como siempre. Sirve también en el teléfono.</li>
      </ol>
    </details>
  );
}

export function ConnectAssistant({
  signals,
  profiles,
  inbox,
}: {
  signals: Signal[];
  profiles: Profile[];
  inbox: AssistantInbox;
}) {
  const from = (source: Signal["source"]) => signals.filter((s) => s.source === source).length;
  return (
    <div className="flex flex-col gap-4">
      <AssistantCard assistant="claude" arrived={from("claude")} message={inbox.message} />
      <AssistantCard assistant="chatgpt" arrived={from("chatgpt")} message={inbox.message} />
      <p className="text-sm text-muted-foreground">
        Puedes usar los dos: lo que se repite cuenta más. ¿Usas Gemini? El mismo mensaje sirve. Antes de guardar, todo
        pasa por el filtro de privacidad y lo sensible (salud, pareja, dinero, política…) se descarta.
      </p>
      <PasteFallback />
      <DetailedProfile profiles={profiles} inbox={inbox} />
      <ConnectorSetup />
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
