"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SeedTopic } from "../../../../seed/people";
import type { Kind, PersonalNode, Signal, Source } from "@/lib/types";
import { Avatar } from "../_components/avatar";
import { BrandLogo, SOURCE_META } from "../_components/brand";
import { Sheet, Splash } from "../_components/chrome";
import { Icon } from "../_components/icons";
import { MingaMark } from "../_components/minga-mark";
import { TopicItem } from "../_components/topic-item";
import { Field, ListRow, Mono, Why } from "../_components/ui";
import { COPY } from "../_lib/copy";
import { buildNode, EXAMPLE_SIGNALS, isSensitive, parseAssistantAnswer, slug } from "../_lib/node";
import { connectedSources, type PhoneState, setPhone, setTopic, usePhone } from "../_lib/store";

// Three steps, one sentence and one button each: your name, your Fuentes, what you share.

const C = COPY.bienvenida;
type Step = "nombre" | "fuentes" | "armando" | "compartir";
const PROGRESS: Record<Step, number> = { nombre: 1 / 3, fuentes: 2 / 3, armando: 2 / 3, compartir: 1 };

/** A teammate from seed/team/*.json, ready to use as your own profile in the demo. */
export type TeamProfile = { slug: string; displayName: string; topics: SeedTopic[] };

/** Load a teammate's seed profile: their topics come public, as in the seed. */
function loadTeamProfile(p: TeamProfile) {
  const personId = `seed-${p.slug}`;
  const node: PersonalNode = {
    personId,
    displayName: p.displayName,
    version: 1,
    topics: p.topics.map(([name, kind, depth, sources]) => ({ id: `${personId}.${slug(name)}`, name, kind, depth, sources, public: true })),
  };
  // Signals back the topics so Fuentes and a later resync keep working.
  const signals: Signal[] = p.topics.flatMap(([label, kind, depth, sources]) =>
    sources.map((source) => ({ source, kind: kind as Kind, label, strength: depth / 3, evidence: "seed" })),
  );
  setPhone({ personId, displayName: p.displayName, node, signals, onboarded: true, focus: { topic: null, person: null } });
}

const AGENTS: Source[] = ["claude", "chatgpt", "gemini"];
const APPS: Source[] = ["spotify", "github", "instagram"];

export function Onboarding({ prompt, team }: { prompt: string; team: TeamProfile[] }) {
  const s = usePhone();
  const [chosen, setStep] = useState<Step | null>(null);

  if (!s) return <Splash />;
  // Returning people (from Perfil) skip the name.
  const step = chosen ?? (s.displayName ? "fuentes" : "nombre");

  return (
    <div className="app">
      <div className="progress" aria-hidden="true">
        <i style={{ width: `${PROGRESS[step] * 100}%` }} />
      </div>
      {step === "nombre" && <NameStep s={s} team={team} next={() => setStep("fuentes")} />}
      {step === "fuentes" && <SourcesStep s={s} prompt={prompt} next={() => setStep("armando")} />}
      {step === "armando" && <BuildingStep next={() => setStep("compartir")} />}
      {step === "compartir" && <ShareStep s={s} />}
    </div>
  );
}

/* ---------- 1 · nombre ---------- */

function NameStep({ s, team, next }: { s: PhoneState; team: TeamProfile[]; next: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(s.displayName);
  const save = () => {
    setPhone({ displayName: name.trim() });
    next();
  };
  return (
    <div className="content step">
      <h1 className="t-hero">{C.name}</h1>
      <Field label={C.name} value={name} placeholder={C.namePlaceholder} maxLength={24} onChange={setName} onSubmit={save} />
      {team.length > 0 && (
        <>
          <div className="sec">{C.team}</div>
          <div className="rows">
            {team.map((p) => (
              <ListRow
                key={p.slug}
                lead={<Avatar id={`seed-${p.slug}`} />}
                title={p.displayName}
                data={p.topics.length}
                chevron
                onClick={() => {
                  loadTeamProfile(p);
                  router.replace("/");
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- 2 · Fuentes ---------- */

function SourcesStep({ s, prompt, next }: { s: PhoneState; prompt: string; next: () => void }) {
  const [open, setOpen] = useState<Source | null>(null);
  const connected = connectedSources(s);
  const count = (src: Source) => s.signals.filter((x) => x.source === src).length;
  const add = (source: Source, signals: Signal[]) => setPhone((p) => ({ signals: [...p.signals.filter((x) => x.source !== source), ...signals] }));

  return (
    <>
      <div className="content step">
        <h1 className="t-hero">{C.sources}</h1>
        <div className="rows">
          {AGENTS.map((src) => (
            <ListRow
              key={src}
              lead={<BrandLogo source={src} />}
              title={SOURCE_META[src].label}
              data={count(src) ? <Icon name="check" /> : undefined}
              chevron={!count(src)}
              onClick={() => setOpen(src)}
            />
          ))}
          {APPS.map((src) => (
            <ListRow key={src} className="off" lead={<BrandLogo source={src} />} title={SOURCE_META[src].label} data={C.soon} />
          ))}
        </div>
        {connected.length === 0 && (
          <button type="button" className="link" style={{ display: "block", margin: "24px auto 0" }} onClick={() => add("claude", EXAMPLE_SIGNALS)}>
            {C.example}
          </button>
        )}
      </div>
      <div className="foot">
        <button className="btn" disabled={connected.length === 0} onClick={next}>
          {C.next}
        </button>
      </div>
      <Sheet open={open !== null} size="auto" onClose={() => setOpen(null)} label={C.pasteTitle}>
        {open && <PasteSheet source={open} prompt={prompt} onDone={(signals) => (add(open, signals), setOpen(null))} />}
      </Sheet>
    </>
  );
}

function PasteSheet({ source, prompt, onDone }: { source: Source; prompt: string; onDone: (signals: Signal[]) => void }) {
  const [copied, setCopied] = useState(false);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string>();

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setError("No pude copiar. Mantén presionado el texto para copiarlo.");
    }
  }

  function read() {
    try {
      onDone(parseAssistantAnswer(raw, source).signals);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <h2 className="t-title">
        {C.pasteTitle} {SOURCE_META[source].label}
      </h2>
      <p className="mute" style={{ margin: "8px 0 16px" }}>
        {C.pasteHint}
      </p>
      <button className="btn ghost" onClick={copy}>
        <Icon name={copied ? "check" : "copy"} />
        {copied ? C.copied : C.copy}
      </button>
      <textarea
        className="paste"
        style={{ marginTop: 16 }}
        aria-label="Respuesta"
        placeholder='[{ "kind": "sabe", "label": "…" }]'
        value={raw}
        onChange={(e) => (setRaw(e.target.value), setError(undefined))}
      />
      {error && <div className="err">{error}</div>}
      <button className="btn" style={{ marginTop: 16 }} disabled={!raw.trim()} onClick={read}>
        {C.read}
      </button>
    </>
  );
}

/* ---------- armando (a breath between steps) ---------- */

function BuildingStep({ next }: { next: () => void }) {
  const s = usePhone();
  const done = useRef(next);
  useEffect(() => {
    done.current = next;
  });
  // Once: build the Nodo, breathe, move on.
  useEffect(() => {
    setPhone((p) => ({ node: buildNode(p.personId, p.displayName, p.signals, p.node) }));
    const t = setTimeout(() => done.current(), 1600);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="content" style={{ textAlign: "center" }}>
      <div className="breathe-mark">
        <MingaMark />
      </div>
      <h1 className="t-title">{C.building}</h1>
      <Mono className="mute">{s?.signals.length ?? 0} señales</Mono>
    </div>
  );
}

/* ---------- 3 · qué compartes ---------- */

function ShareStep({ s }: { s: PhoneState }) {
  const router = useRouter();
  const topics = s.node?.topics ?? [];
  const shared = topics.filter((t) => t.public && !isSensitive(t)).length;
  const pending = topics.filter((t) => !t.public && !isSensitive(t));
  return (
    <>
      <div className="content step">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <h1 className="t-hero" style={{ flex: 1 }}>
            {C.share}
          </h1>
          <Why text={C.shareHelp} />
        </div>
        {pending.length > 0 && (
          <button type="button" className="link" onClick={() => pending.forEach((t) => setTopic(t.id, { public: true }))}>
            {C.shareAll}
          </button>
        )}
        <div className="rows">
          {topics.map((t) => (
            <TopicItem key={t.id} topic={t} />
          ))}
        </div>
      </div>
      <div className="foot">
        <p className="mono mute" style={{ textAlign: "center", margin: "0 0 16px" }}>
          {shared} públicos · {topics.length - shared} contigo
        </p>
        <button
          className="btn"
          onClick={() => {
            setPhone({ onboarded: true });
            router.replace("/");
          }}
        >
          {C.done}
        </button>
      </div>
    </>
  );
}
