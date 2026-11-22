"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SeedTopic } from "../../../../seed/people";
import { admitSignals, IncomingSignalsSchema, parsePastedSignals } from "@/lib/connectors/assistant";
import { setShared, shareRecommended } from "@/lib/node/node";
import type { Kind, PersonalNode, Signal, Source } from "@/lib/types";
import { Avatar } from "../_components/avatar";
import { BrandLogo, SOURCE_META } from "../_components/brand";
import { Sheet, Splash } from "../_components/chrome";
import { Icon } from "../_components/icons";
import { MingaMark } from "../_components/minga-mark";
import { TopicItem } from "../_components/topic-item";
import { Field, ListRow, Mono, Why } from "../_components/ui";
import { checkIn, DEFAULT_ROOM } from "../_lib/api";
import { COPY } from "../_lib/copy";
import { EXAMPLE_SIGNALS, isLocked, isPublished } from "../_lib/node";
import { type NodeSync, useNodeSync } from "../_lib/node-sync";
import { connectedSources, logOutbox, mergeSignals, type PhoneState, setPhone, usePhone } from "../_lib/store";
import { type AssistantInbox, classifyOnApi, type InboxSink, useAssistantInbox, useCopy } from "../onboarding/connect-assistant";
import { addProfiles } from "../onboarding/store";

// Three steps, one sentence and one button each: your name, your Fuentes, what you share.
// Behind them, the backend's onboarding: a 15-minute permission in the message you paste in your
// assistant, the privacy filter on every topic, and a check-in that makes you a user of the room.

const C = COPY.bienvenida;
type Step = "nombre" | "fuentes" | "armando" | "compartir";
const PROGRESS: Record<Step, number> = { nombre: 1 / 3, fuentes: 2 / 3, armando: 2 / 3, compartir: 1 };

/** A teammate from seed/team/*.json, ready to use as your own profile in the demo. */
export type TeamProfile = { slug: string; displayName: string; topics: SeedTopic[] };

/** Signals and detailed profiles that arrive while you are in the onboarding. */
const MINGA_SINK: InboxSink = { onSignals: mergeSignals, onProfiles: addProfiles };

/** A teammate's seed profile: their topics as signals, so they go through the filter like anyone's. */
function chooseTeammate(p: TeamProfile) {
  const personId = `seed-${p.slug}`;
  const signals: Signal[] = p.topics.flatMap(([label, kind, depth, sources]) =>
    sources.map((source) => ({ source, kind: kind as Kind, label, strength: depth / 3, evidence: "seed" })),
  );
  setPhone({ personId, displayName: p.displayName, signals, node: null, room: null, onboarded: false, focus: { topic: null, person: null } });
}

/** As in the seed, a teammate shares everything the filter lets through. */
function shareEverything(node: PersonalNode): PersonalNode {
  return node.topics.filter((t) => !isLocked(t)).reduce((n, t) => setShared(n, t.id, true), node);
}

const roomFromLink = () => new URLSearchParams(window.location.search).get("sala")?.trim().toUpperCase() || DEFAULT_ROOM;

const AGENTS: Source[] = ["claude", "chatgpt", "gemini"];
const APPS: Source[] = ["spotify", "github", "instagram"];

export function Onboarding({ team }: { team: TeamProfile[] }) {
  const s = usePhone();
  const inbox = useAssistantInbox(MINGA_SINK);
  const sync = useNodeSync(s);
  const [chosen, setStep] = useState<Step | null>(null);
  const [asTeammate, setAsTeammate] = useState(false);

  if (!s) return <Splash />;
  // Returning people (from Perfil) skip the name.
  const step = chosen ?? (s.displayName ? "fuentes" : "nombre");

  return (
    <div className="app">
      <div className="progress" aria-hidden="true">
        <i style={{ width: `${PROGRESS[step] * 100}%` }} />
      </div>
      {step === "nombre" && (
        <NameStep
          s={s}
          team={team}
          next={() => setStep("fuentes")}
          asTeammate={(p) => {
            chooseTeammate(p);
            setAsTeammate(true);
            setStep("armando");
          }}
        />
      )}
      {step === "fuentes" && <SourcesStep s={s} inbox={inbox} next={() => setStep("armando")} />}
      {step === "armando" && <BuildingStep sync={sync} asTeammate={asTeammate} next={() => setStep("compartir")} />}
      {step === "compartir" && <ShareStep s={s} />}
    </div>
  );
}

/* ---------- 1 · nombre ---------- */

function NameStep({ s, team, next, asTeammate }: { s: PhoneState; team: TeamProfile[]; next: () => void; asTeammate: (p: TeamProfile) => void }) {
  const [name, setName] = useState(s.displayName);
  const save = () => {
    if (!name.trim()) return;
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
              <ListRow key={p.slug} lead={<Avatar id={`seed-${p.slug}`} />} title={p.displayName} data={p.topics.length} chevron onClick={() => asTeammate(p)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- 2 · Fuentes ---------- */

function SourcesStep({ s, inbox, next }: { s: PhoneState; inbox: AssistantInbox; next: () => void }) {
  const [open, setOpen] = useState<Source | null>(null);
  const connected = connectedSources(s);
  const count = (src: Source) => s.signals.filter((x) => x.source === src).length;
  const addExample = () => setPhone((p) => ({ signals: [...p.signals.filter((x) => x.source !== "claude"), ...EXAMPLE_SIGNALS] }));

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
          <button type="button" className="link" style={{ display: "block", margin: "24px auto 0" }} onClick={addExample}>
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
        {open && <AssistantSheet source={open} inbox={inbox} arrived={count(open)} />}
      </Sheet>
    </>
  );
}

/** One message for any assistant: it carries the permission, and the assistant delivers on its own. */
function AssistantSheet({ source, inbox, arrived }: { source: Source; inbox: AssistantInbox; arrived: number }) {
  const label = SOURCE_META[source].label;
  const { status, text, copy } = useCopy(inbox.message, label);
  const [raw, setRaw] = useState("");
  const [note, setNote] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  // The fallback: the assistant answered with the JSON instead of a link. Same filter as the other ways in.
  async function read() {
    const items = parsePastedSignals(raw);
    // The assistant names itself as source; trust the row the person tapped instead.
    const parsed = IncomingSignalsSchema.safeParse(Array.isArray(items) ? items.map((i) => ({ ...(i as object), source })) : items);
    if (!parsed.success) return setError(C.unreadable);
    setBusy(true);
    setError(undefined);
    try {
      logOutbox("Filtro de privacidad de Minga", `El nombre y el tipo de ${parsed.data.length} temas, sin tu nombre`);
      const { accepted, held } = await admitSignals(parsed.data, classifyOnApi);
      mergeSignals(accepted);
      setRaw("");
      setNote(held ? `${C.arrived(accepted.length)} ${C.held(held)}` : C.arrived(accepted.length));
    } catch {
      // Without the filter nothing is loaded: better to ask again than to keep something unreviewed.
      setError(C.filterDown);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="t-title">
        {C.pasteTitle} {label}
      </h2>
      <p className="mute" style={{ margin: "8px 0 16px" }}>
        {C.pasteHint}
      </p>
      <button className="btn ghost" onClick={copy}>
        <Icon name={status.startsWith("Copiado") ? "check" : "copy"} />
        {status.startsWith("Copiado") ? C.copied : C.copy}
      </button>
      <p role="status" className="mute" style={{ margin: "8px 0 0", minHeight: 20 }}>
        {arrived > 0 ? C.arrived(arrived) : status}
      </p>
      {text && (
        // When the clipboard refuses (iOS, an embedded browser), the message is here to copy by hand.
        <details className="mute" style={{ marginTop: 8 }}>
          <summary>{C.seeMessage}</summary>
          <pre className="paste" style={{ marginTop: 8, maxHeight: 200, overflow: "auto", whiteSpace: "pre-wrap", userSelect: "all" }}>
            {text}
          </pre>
        </details>
      )}
      <textarea
        className="paste"
        style={{ marginTop: 16 }}
        aria-label={C.pasteFallback}
        placeholder={C.pasteFallback}
        value={raw}
        onChange={(e) => (setRaw(e.target.value), setError(undefined), setNote(undefined))}
      />
      {error && <div className="err">{error}</div>}
      {note && <p className="mute" style={{ marginTop: 8 }}>{note}</p>}
      <button className="btn" style={{ marginTop: 16 }} disabled={!raw.trim() || busy} onClick={read}>
        {busy ? C.reading : C.read}
      </button>
      <Link href="/conectar" className="link" style={{ display: "block", margin: "16px auto 0", textAlign: "center" }}>
        {COPY.conectar.fromSheet}
      </Link>
    </>
  );
}

/* ---------- armando (a breath between steps, while the filter reviews) ---------- */

function BuildingStep({ sync, asTeammate, next }: { sync: NodeSync; asTeammate: boolean; next: () => void }) {
  const router = useRouter();
  const s = usePhone();
  const [breathed, setBreathed] = useState(false);
  const [error, setError] = useState<string>();
  const entering = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setBreathed(true), 1600);
    return () => clearTimeout(t);
  }, []);

  // A teammate goes straight in, as in the seed: everything public, then the room.
  function enter() {
    if (entering.current) return;
    entering.current = true;
    setError(undefined);
    setPhone((p) => (p.node ? { node: shareEverything(p.node) } : {}));
    void checkIn(roomFromLink()).then((r) => {
      entering.current = false;
      if (!r.ok) return setError(r.error);
      setPhone({ onboarded: true });
      router.replace("/");
    });
  }

  const ready = breathed && !sync.reviewing && !sync.error && !!s?.node;
  useEffect(() => {
    if (!ready) return;
    if (asTeammate) enter();
    else next();
    // enter() only reads refs and stable setters; re-running it on every render would check in twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, asTeammate]);

  const problem = sync.error ?? error;
  return (
    <div className="content" style={{ textAlign: "center" }}>
      <div className="breathe-mark">
        <MingaMark />
      </div>
      <h1 className="t-title">{C.building}</h1>
      <Mono className="mute">{s?.signals.length ?? 0} señales</Mono>
      {problem && (
        <>
          <div className="err">{problem}</div>
          <button type="button" className="link" style={{ display: "block", margin: "16px auto 0" }} onClick={sync.error ? sync.retry : enter}>
            {C.retry}
          </button>
        </>
      )}
    </div>
  );
}

/* ---------- 3 · qué compartes ---------- */

function ShareStep({ s }: { s: PhoneState }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [rejected, setRejected] = useState(0);
  const topics = s.node?.topics ?? [];
  const shared = topics.filter(isPublished).length;
  // "Lo recomendado": what the filter found safe and you haven't decided on yet.
  const recommended = topics.filter((t) => t.privacy?.level === "segura" && t.privacy.decidedBy === "default").length;

  async function done() {
    if (rejected) return router.replace("/");
    setBusy(true);
    setError(undefined);
    const r = await checkIn(roomFromLink());
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setPhone({ onboarded: true });
    if (r.rejected) return setRejected(r.rejected);
    router.replace("/");
  }

  return (
    <>
      <div className="content step">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <h1 className="t-hero" style={{ flex: 1 }}>
            {C.share}
          </h1>
          <Why text={C.shareHelp} />
        </div>
        {recommended > 0 && (
          <button type="button" className="link" onClick={() => setPhone((p) => (p.node ? { node: shareRecommended(p.node) } : {}))}>
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
        {error && <div className="err" style={{ textAlign: "center", margin: "0 0 12px" }}>{error}</div>}
        {rejected > 0 && <p className="mute" style={{ textAlign: "center", margin: "0 0 12px" }}>{C.rejected(rejected)}</p>}
        <button className="btn" disabled={busy} onClick={done}>
          {busy ? C.entering : rejected ? C.toHome : C.done}
        </button>
      </div>
    </>
  );
}
