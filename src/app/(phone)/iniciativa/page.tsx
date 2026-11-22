"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "../_components/avatar";
import { Splash, useOnboardedPhone } from "../_components/chrome";
import { Icon } from "../_components/icons";
import { Mono, Why } from "../_components/ui";
import { intentWords, relevantTopic } from "../_lib/conversations";
import { COPY } from "../_lib/copy";
import { affinities, cap, type Coincidence, DEMO, RELATION, useEncounters } from "../_lib/people";
import { connectionEncounters, createPlan, usePlanGraph } from "../_lib/plans";
import { type Initiative, setPhone } from "../_lib/store";

// From Inicio: what you want to do → who you want with you → what your Agente must consider →
// the group Conversación, where the Agentes start coordinating.

const C = COPY.iniciativa;
const RANK = { amigo: 0, conocido: 1, cercania: 2 } as const;


/** A new Iniciativa, stamped now (outside render). */
function newInitiative(intent: string, members: string[], restrictions: string[]): Initiative {
  return { id: `i-${Date.now().toString(36)}`, intent, members, restrictions, at: new Date().toISOString() };
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export default function IniciativaPage() {
  const s = useOnboardedPhone();
  const router = useRouter();
  const encounters = useEncounters();
  const [step, setStep] = useState<"who" | "limits">("who");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [note, setNote] = useState("");
  // With a backend, an Iniciativa is a plan among your accepted connections.
  const graph = usePlanGraph();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();
  // Free text: each line (or sentence ended in a period) is one thing to consider.
  const limits = note
    .split(/\n+|(?<=\.)\s+/)
    .map((l) => l.trim().replace(/[.;]+$/, ""))
    .filter(Boolean);

  const intent = s?.intent.trim() ?? "";
  useEffect(() => {
    if (s && !intent) router.replace("/");
  }, [s, intent, router]);
  if (!s || !intent || encounters === undefined || graph === undefined) return <Splash />;

  const words = intentWords(intent);
  const network = new Map(graph?.connections.map((c) => [c.personId, c.contacts]));
  const contacts = affinities(s, graph ? connectionEncounters(graph, encounters) : encounters).sort((a, b) => RANK[a.relation] - RANK[b.relation]);
  // Your Agente's picks: first who knows about it, then close people you already share topics with.
  const withReason = contacts.map((c) => {
    const topic = relevantTopic(c, words);
    if (topic) return { c, why: `sabe de ${topic}`, rank: 0 };
    if (c.relation !== "cercania" && c.items.length) return { c, why: `comparten ${cap(c.items[0].topic)}`, rank: 1 };
    return { c, why: null, rank: 2 };
  });
  const suggested = withReason.filter((x) => x.why).sort((a, b) => a.rank - b.rank).slice(0, 5);
  const picks = new Set(suggested.map((x) => x.c.person.personId));
  // Until you touch the list, your Agente's picks are checked: the first three who know about it.
  const chosen = picked ?? new Set(suggested.slice(0, 3).map((x) => x.c.person.personId));
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const q = fold(query);
  const matches = (c: Coincidence) => !q || fold(c.person.displayName).includes(q) || c.person.topics.some((t) => fold(t.name).includes(q));
  // While searching by topic, each row says which of their topics matched.
  const hit = (c: Coincidence) => {
    const t = q ? c.person.topics.find((x) => fold(x.name).includes(q)) : undefined;
    return t ? cap(t.name) : undefined;
  };
  const shownSuggested = suggested.filter((x) => matches(x.c));
  const rest = withReason.filter((x) => !picks.has(x.c.person.personId) && matches(x.c));
  const people = contacts.filter((c) => chosen.has(c.person.personId));

  // Whose Agente can also draw on contacts of their own, said under their name.
  const reach = (c: Coincidence) => {
    const n = network.get(c.person.personId) ?? 0;
    return n > 0 ? `${n} ${n === 1 ? COPY.plan.oneContact : COPY.plan.contacts}` : undefined;
  };
  const tooMany = !DEMO && people.length > 5;

  async function create() {
    if (!DEMO) {
      setCreating(true);
      setError(undefined);
      const created = await createPlan(intent, people.map((c) => c.person.personId), limits);
      if (created.ok) return router.replace(`/conversaciones/${created.planId}`);
      setCreating(false);
      return setError(created.error);
    }
    const init = newInitiative(
      intent,
      people.map((c) => c.person.personId),
      limits,
    );
    setPhone((p) => ({ initiatives: [init, ...(p.initiatives ?? [])] }));
    router.replace(`/conversaciones/${init.id}`);
  }


  return (
    <div className="app">
      <div className="progress" aria-hidden="true">
        <i style={{ width: step === "who" ? "50%" : "100%" }} />
      </div>
      <div className="content step init">
        <button type="button" className="init-back" aria-label={C.back} onClick={() => (step === "limits" ? setStep("who") : router.back())}>
          <Icon name="arrow" />
        </button>
        <p className="init-intent">
          <Mono className="mute">{C.label}</Mono>
          {intent}
        </p>

        {step === "who" ? (
          <>
            <h1 className="t-hero">{C.who}</h1>
            <div className="gsearch light" role="search">
              <Icon name="search" />
              <input type="search" value={query} placeholder={C.search} aria-label={C.search} enterKeyHint="search" onChange={(e) => setQuery(e.target.value)} />
              {query && (
                <button type="button" aria-label="Borrar búsqueda" onClick={() => setQuery("")}>
                  <Icon name="x" />
                </button>
              )}
            </div>

            {shownSuggested.length > 0 && (
              <>
                <div className="sec">
                  {C.suggested}
                  <Why text="Tu Agente los sugiere porque saben de lo que quieres hacer o ya comparten algo contigo." />
                </div>
                <div className="rows">
                  {shownSuggested.map(({ c, why }) => (
                    <PersonCheck key={c.person.personId} c={c} sub={[hit(c) ?? why, reach(c)].filter(Boolean).join(" · ") || undefined} on={chosen.has(c.person.personId)} onToggle={toggle} />
                  ))}
                </div>
              </>
            )}
            {rest.length > 0 && (
              <>
                <div className="sec">{C.everyone}</div>
                <div className="rows">
                  {rest.map(({ c }) => (
                    <PersonCheck key={c.person.personId} c={c} sub={[hit(c), reach(c)].filter(Boolean).join(" · ") || undefined} on={chosen.has(c.person.personId)} onToggle={toggle} />
                  ))}
                </div>
              </>
            )}
            {shownSuggested.length + rest.length === 0 && <p className="mute">{graph && contacts.length === 0 ? COPY.plan.noConnections : C.none}</p>}
            {tooMany && <p className="mute">{COPY.plan.tooMany}</p>}
          </>
        ) : (
          <>
            <h1 className="t-hero">{C.limits}</h1>
            <p className="mute" style={{ margin: "-16px 0 24px", fontSize: 13 }}>
              {C.limitsHelp}
            </p>
            <textarea
              className="limits-text"
              aria-label={C.limits}
              value={note}
              placeholder={C.limitsPlaceholder}
              maxLength={400}
              rows={6}
              autoFocus
              onChange={(e) => setNote(e.target.value)}
            />
            {error && (
              <p role="alert" className="mute" style={{ marginTop: 12 }}>
                {error}
              </p>
            )}
          </>
        )}
      </div>

      <div className="foot init-foot">
        <span className="stack">
          {people.slice(0, 5).map((c) => (
            <Avatar key={c.person.personId} id={c.person.personId} />
          ))}
        </span>
        <Mono className="mute">
          {people.length} {people.length === 1 ? C.one : C.many}
        </Mono>
        {step === "who" ? (
          <button className="btn" disabled={people.length === 0 || tooMany} onClick={() => setStep("limits")}>
            {C.next}
          </button>
        ) : (
          <button className="btn" disabled={creating} onClick={create}>
            <Icon name="chat" />
            {creating ? COPY.plan.creating : limits.length ? C.create : `${C.create} · ${C.skip.toLowerCase()}`}
          </button>
        )}
      </div>
    </div>
  );
}

function PersonCheck({ c, sub, on, onToggle }: { c: Coincidence; sub?: string; on: boolean; onToggle: (id: string) => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} className="row" onClick={() => onToggle(c.person.personId)}>
      <span className="lead">
        <Avatar id={c.person.personId} />
      </span>
      <span className="main">
        <span className="title" style={{ display: "block" }}>
          {c.person.displayName}
        </span>
        <span className="sub" style={{ display: "block" }}>
          <span className={`rel ${c.relation}`}>{RELATION[c.relation].label}</span>
          {sub && ` · ${sub}`}
        </span>
      </span>
      <span className={`check${on ? " on" : ""}`} aria-hidden="true">
        {on && <Icon name="check" />}
      </span>
    </button>
  );
}
