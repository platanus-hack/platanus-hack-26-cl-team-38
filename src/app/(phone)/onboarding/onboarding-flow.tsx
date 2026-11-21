"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { KIND_LABEL, SOURCE_LABEL } from "@/app/explorar/palette";
import { Button } from "@/components/ui/button";
import { checkInBody, draftsFromSignals, needsVerdict, reconcile, setShared, shareRecommended } from "@/lib/node/node";
import { agentBrief } from "@/lib/privacy/agent-brief";
import { fetchVerdicts } from "@/lib/privacy/client";
import { hasIdentifier } from "@/lib/privacy/screen";
import type { PersonalNode, Topic } from "@/lib/types";
import { ConnectAssistant, useAssistantInbox } from "./connect-assistant";
import { NodePreview } from "./node-preview";
import { rememberMe, usePerson, useProfiles, useSignals, useStoredNode } from "./store";

const STEPS = ["Trae tu info", "Elige qué es público", "Entra a la sala"] as const;

const CheckInResponseSchema = z.object({
  roomId: z.string(),
  accepted: z.array(z.string()),
  rejected: z.array(z.object({ topicId: z.string(), reason: z.string() })),
});

export function OnboardingFlow() {
  const signals = useSignals();
  const inbox = useAssistantInbox();
  const profiles = useProfiles();
  const [person, setPerson] = usePerson();
  const [node, setNode] = useStoredNode();
  const [step, setStep] = useState(() => (node && node.topics.length > 0 ? 1 : 0));
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  // Read by the effect below without re-running it on every choice. Declared first, so it is
  // current by the time that effect runs.
  const nodeRef = useRef(node);
  useEffect(() => {
    nodeRef.current = node;
  });

  // The node follows the signals: new ones go through the privacy filter, removed ones leave, and
  // every public/private choice already made is kept.
  useEffect(() => {
    const drafts = draftsFromSignals(person.personId, signals);
    const missing = needsVerdict(nodeRef.current, drafts);
    const owner = { personId: person.personId, displayName: nodeRef.current?.displayName ?? "Tú" };
    if (missing.length === 0) {
      const next = reconcile(nodeRef.current, owner, drafts, []);
      if (JSON.stringify(next.topics) !== JSON.stringify(nodeRef.current?.topics ?? [])) setNode(next);
      return;
    }
    let cancelled = false;
    setReviewing(true);
    setError("");
    fetchVerdicts(missing)
      .then((verdicts) => {
        if (!cancelled) setNode(reconcile(nodeRef.current, owner, drafts, missing.map((draft, i) => ({ draft, verdict: verdicts[i] }))));
      })
      .catch(() => !cancelled && setError("No pudimos revisar la privacidad de tus temas. Intenta de nuevo en un rato."))
      .finally(() => !cancelled && setReviewing(false));
    return () => {
      cancelled = true;
    };
    // setNode writes storage too; it is stable enough for this effect, which must run only on new signals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals, person.personId]);

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex gap-1 text-xs" aria-label="Pasos">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1">
            <button
              type="button"
              disabled={i > 0 && !node?.topics.length}
              onClick={() => setStep(i)}
              aria-current={step === i ? "step" : undefined}
              className={`w-full border-t-2 pt-1 text-left disabled:opacity-40 ${step === i ? "border-foreground font-medium" : "border-muted text-muted-foreground"}`}
            >
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {step === 0 && (
        <>
          <ConnectAssistant signals={signals} profiles={profiles} inbox={inbox} />
          <Button size="lg" disabled={!node?.topics.length} onClick={() => setStep(1)}>
            {reviewing ? "Revisando tus temas…" : "Siguiente: elegir qué es público"}
          </Button>
        </>
      )}

      {step === 1 && node && <Choose node={node} reviewing={reviewing} onChange={setNode} onNext={() => setStep(2)} />}

      {step === 2 && node && (
        <EnterRoom
          node={node}
          name={person.displayName}
          onName={(displayName) => setPerson({ ...person, displayName })}
          onRejected={(ids) => setNode(ids.reduce((n, id) => setShared(n, id, false), node))}
        />
      )}
    </div>
  );
}

function PrivacyRule() {
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div className="rounded-lg bg-[rgba(31,138,91,0.08)] p-3">
        <dt className="font-medium">Público</dt>
        <dd className="text-muted-foreground">Lo ve la sala con tu nombre. Es lo único que se usa para armar mesas y lo único que tu agente puede citar.</dd>
      </div>
      <div className="rounded-lg bg-muted p-3">
        <dt className="font-medium">Privado</dt>
        <dd className="text-muted-foreground">
          No se usa para buscar conexiones ni para lo que responde tu agente. Solo le da personalidad: su tono y su forma de hablar.
        </dd>
      </div>
    </dl>
  );
}

function Choose({ node, reviewing, onChange, onNext }: { node: PersonalNode; reviewing: boolean; onChange: (node: PersonalNode) => void; onNext: () => void }) {
  const pending = node.topics.filter((t) => t.privacy?.level === "segura" && t.privacy.decidedBy === "default").length;
  const sorted = [...node.topics].sort((a, b) => Number(b.privacy?.level === "segura") - Number(a.privacy?.level === "segura") || b.depth - a.depth);
  const toggle = (t: Topic) => onChange(setShared(node, t.id, !t.public));
  const shared = node.topics.filter((t) => t.public).length;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Todo parte privado. Elige qué quieres que vea la sala; comparte lo que dirías en voz alta al presentarte.</p>
      <PrivacyRule />
      <NodePreview topics={node.topics} ownerName={node.displayName} locked={reviewing} onToggle={toggle} />

      {pending > 0 && (
        <Button variant="secondary" onClick={() => onChange(shareRecommended(node))}>
          Hacer públicos los {pending} recomendados
        </Button>
      )}

      <ul className="flex flex-col divide-y">
        {sorted.map((t) => (
          <li key={t.id} className="flex flex-col gap-1 py-2">
            <div className="flex items-center gap-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{t.name}</span>
                <span className="text-xs text-muted-foreground">
                  {KIND_LABEL[t.kind]} · {t.sources.map((s) => SOURCE_LABEL[s]).join(", ")}
                </span>
              </span>
              <div role="radiogroup" aria-label={`${t.name}: público o privado`} className="flex rounded-lg bg-muted p-0.5 text-xs">
                {[true, false].map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    role="radio"
                    aria-checked={t.public === value}
                    onClick={() => onChange(setShared(node, t.id, value))}
                    className={`rounded-md px-2 py-1 ${t.public === value ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                  >
                    {value ? "Público" : "Privado"}
                  </button>
                ))}
              </div>
            </div>
            {t.privacy?.level === "personal" && <p className="text-xs text-amber-700">Ojo: {t.privacy.reason ?? "podría decir de más sobre ti."}</p>}
          </li>
        ))}
      </ul>

      <Button size="lg" disabled={shared === 0} onClick={onNext}>
        {shared === 0 ? "Haz público al menos un tema" : `Siguiente: entrar con ${shared} ${shared === 1 ? "tema público" : "temas públicos"}`}
      </Button>
    </div>
  );
}

function EnterRoom({ node, name, onName, onRejected }: { node: PersonalNode; name: string; onName: (name: string) => void; onRejected: (topicIds: string[]) => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const [roomCode, setRoomCode] = useState(params.get("sala") ?? "HACK26");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; href?: string }>();
  const named = { ...node, displayName: name.trim() };
  const brief = agentBrief({ ...node, displayName: "Tú" });
  const badName = hasIdentifier(name);

  async function checkIn() {
    setBusy(true);
    setNotice(undefined);
    try {
      const response = await fetch("/api/checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(checkInBody(named, roomCode.trim().toUpperCase())),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = z.object({ error: z.string() }).safeParse(json);
        return setNotice({ text: `No pudimos entrarte a la sala${message.success ? `: ${message.data.error}` : "."}` });
      }
      const result = CheckInResponseSchema.parse(json);
      rememberMe(node.personId);
      const href = `/explorar?sala=${encodeURIComponent(roomCode.trim().toUpperCase())}&persona=${encodeURIComponent(node.personId)}`;
      if (result.rejected.length === 0) return router.push(href);
      // The server classifies again and can disagree: those topics go back to private here too.
      onRejected(result.rejected.map((r) => r.topicId));
      setNotice({ text: `Entraste, pero el servidor dejó ${result.rejected.length === 1 ? "un tema" : `${result.rejected.length} temas`} en privado.`, href });
    } catch {
      setNotice({ text: "No pudimos entrarte a la sala. Intenta de nuevo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Tu nombre en la sala</span>
        <input value={name} maxLength={40} onChange={(e) => onName(e.target.value)} className="rounded-lg border bg-background px-3 py-2" autoComplete="given-name" />
        {badName && <span className="text-xs text-destructive">Tu nombre no puede llevar un correo, teléfono ni RUT.</span>}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Código de la sala</span>
        <input value={roomCode} maxLength={40} onChange={(e) => setRoomCode(e.target.value)} className="rounded-lg border bg-background px-3 py-2 uppercase" />
      </label>

      <section className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
        <p>
          <span className="font-medium">La sala verá {brief.projection.topics.length}:</span> {brief.projection.topics.map((t) => t.name).join(", ")}.
        </p>
        <p className="text-muted-foreground">
          Tu agente guarda {brief.personality.length} como personalidad. No salen a la sala, no arman mesas y tu agente no los nombra ni los usa para decidir.
        </p>
      </section>

      {notice && (
        <div role="status" className="flex flex-col gap-1 text-sm">
          <p>{notice.text}</p>
          {notice.href && (
            <button type="button" className="self-start underline underline-offset-4" onClick={() => router.push(notice.href!)}>
              Ir a la sala
            </button>
          )}
        </div>
      )}

      <Button size="lg" disabled={busy || !name.trim() || badName || !roomCode.trim() || brief.projection.topics.length === 0} onClick={checkIn}>
        {busy ? "Entrando…" : "Entrar a la sala"}
      </Button>
    </div>
  );
}
