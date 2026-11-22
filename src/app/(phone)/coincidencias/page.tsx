"use client";

import type { CSSProperties } from "react";
import type { PublicTopic } from "@/lib/types";
import { AiCard, MoreTopics } from "../_components/ai-card";
import { Avatar } from "../_components/avatar";
import { Sheet, Splash, TabBar, useOnboardedPhone } from "../_components/chrome";
import { Icon } from "../_components/icons";
import { AffinityGraph } from "../_components/affinity-graph";
import { MatchGraph, setFocus } from "../_components/match-graph";
import { ListRow, Mono } from "../_components/ui";
import { api } from "../_lib/api";
import { COPY } from "../_lib/copy";
import { recommend } from "../_lib/insight";
import { matchPhrase } from "../_lib/matches";
import {
  byTopic,
  cap,
  clampRadius,
  type Coincidence,
  coincidences,
  DEMO,
  fmtMeters,
  isVisible,
  myInterests,
  RANGE,
  RELATION,
  relTime,
  useEncounters,
} from "../_lib/people";
import { useContacts } from "../_lib/plans";
import { getPhone, setPhone } from "../_lib/store";
import { toast } from "../_lib/toast";

const C = COPY.coincidencias;

export default function CoincidenciasPage() {
  const s = useOnboardedPhone();
  const encounters = useEncounters();
  const contacts = useContacts(s);
  if (!s) return <Splash />;

  const visible = isVisible(s);
  const view = s.explore ?? "personas";
  const radius = clampRadius(s.radiusM);
  const coins = encounters && visible ? coincidences(s, encounters) : [];
  const groups = byTopic(coins);
  const selected = groups.find((g) => g.topic === s.focus.topic);
  const person = coins.find((c) => c.person.personId === s.focus.person);
  const close = () => setFocus({ topic: null, person: null });
  const setVisible = (on: boolean) => setPhone({ privacy: { ...s.privacy, discoverable: on } });

  return (
    <div className="app with-tabs">
      <div className="graph-screen">
        <div className="head">
          <h1 className="sr">{C.title}</h1>
          <div className="segbar" role="radiogroup" aria-label={C.title}>
            {(["personas", "temas"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => (setPhone({ explore: v }), close())}>
                {v === "personas" ? C.people : C.topics}
              </button>
            ))}
          </div>
          <div className="near-row">
            <Mono className="mute">
              {visible ? `${coins.length} · ${fmtMeters(radius)}` : "—"}
              {DEMO && !s.locationOn ? ` · ${C.demoShort}` : ""}
            </Mono>
            <label className="near-switch">
              <span>{C.visible}</span>
              <button type="button" role="switch" aria-checked={visible} aria-label={C.visible} className="switch" onClick={() => setVisible(!visible)} />
            </label>
          </div>
        </div>
        {encounters === undefined ? (
          <div className="empty">{C.loading}</div>
        ) : !visible ? (
          <div className="empty">
            <div className="empty-state">
              <p>{C.invisible}</p>
              <button type="button" className="btn light" onClick={() => setVisible(true)}>
                {C.turnVisible}
              </button>
            </div>
          </div>
        ) : coins.length === 0 ? (
          <div className="empty">
            <div className="empty-state">
              <p>{C.nobody(radius)}</p>
              {radius < RANGE.max && <p className="mute">{C.widenHint}</p>}
            </div>
          </div>
        ) : (
          <div className="gwrap">
            {view === "personas" ? (
              <AffinityGraph W={360} H={400} me={{ id: s.personId }} contacts={coins} focus={s.focus.person} />
            ) : (
              <MatchGraph W={360} H={400} compact me={{ id: s.personId, name: s.displayName }} groups={groups} focus={s.focus} />
            )}
          </div>
        )}
        {visible && (
          <label className="range">
            <span className="sr">{C.range}</span>
            <input
              type="range"
              min={RANGE.min}
              max={RANGE.max}
              step={RANGE.step}
              value={radius}
              aria-label={C.range}
              aria-valuetext={`${radius} metros`}
              style={{ "--fill": `${((radius - RANGE.min) / (RANGE.max - RANGE.min)) * 100}%` } as CSSProperties}
              onChange={(e) => setPhone({ radiusM: Number(e.target.value) })}
            />
            <Mono>{radius} m</Mono>
          </label>
        )}
      </div>

      <Sheet open={!!selected || !!person} size={person ? "detail" : "list"} onClose={close} label={selected?.topic ?? ""}>
        {person ? (
          <PersonSummary
            key={person.person.personId}
            c={person}
            myTopics={myInterests(s)}
            state={contacts?.some((x) => x.person.personId === person.person.personId) ? "contact" : (s.requests ?? []).includes(person.person.personId) ? "requested" : "none"}
          />
        ) : (
          selected && (
            <>
              <h2 className="t-title">{cap(selected.topic)}</h2>
              <div className="rows">
                {selected.people.map((c) => (
                  <ListRow
                    key={c.person.personId}
                    lead={<Avatar id={c.person.personId} />}
                    title={c.person.displayName}
                    sub={
                      <>
                        <span className={`rel ${c.relation}`}>{RELATION[c.relation].label}</span> · {c.items.map(matchPhrase).join(" · ")}
                      </>
                    }
                    data={fmtMeters(c.distanceM)}
                    onClick={() => setFocus({ person: c.person.personId })}
                  />
                ))}
              </div>
            </>
          )
        )}
      </Sheet>
      <TabBar />
    </div>
  );
}

/** Asks to become Contactos (or takes the request back). It is a connection: both must accept. */
async function requestContact(c: Coincidence, on: boolean) {
  const { personId, displayName: name } = c.person;
  const mark = (add: boolean) => setPhone((p) => ({ requests: add ? [...new Set([...(p.requests ?? []), personId])] : (p.requests ?? []).filter((id) => id !== personId) }));
  mark(on);
  // Demo mode has no backend: the request stays pending on this phone.
  if (DEMO) return toast(on ? C.requested(name) : C.requestCanceled);
  const body = { personId: getPhone().personId, otherId: personId, action: on ? "propose" : "close", ...(on ? { origin: { place: c.place || "Cerca tuyo" } } : {}) };
  const reply = await api("/api/connections", { method: "POST", body: JSON.stringify(body) })
    .then(async (r) => (r.ok ? ((await r.json()) as { connection: { status: string } | null }) : null))
    .catch(() => null);
  if (!on) return toast(C.requestCanceled);
  if (!reply) return (mark(false), toast(C.connectFailed));
  // Asking someone who had already asked you is accepting.
  toast(reply.connection?.status === "aceptada" ? C.nowContact(name) : C.requested(name));
}

/** Someone's public information, summarized, and the way to ask them to be your Contacto. */
function PersonSummary({ c, myTopics, state }: { c: Coincidence; myTopics: PublicTopic[]; state: "none" | "requested" | "contact" }) {
  const shared = new Set(c.items.map((i) => i.topic));
  const rest = c.person.topics.filter((t) => !shared.has(t.name));
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Avatar id={c.person.personId} className="md-face" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="t-title">{c.person.displayName}</h2>
          <span className={`rel ${c.relation}`}>{RELATION[c.relation].label}</span>{" "}
          <Mono className="mute">
            · {fmtMeters(c.distanceM)} · {c.place} · {relTime(c.at)}
          </Mono>
        </div>
      </div>

      {state === "contact" ? (
        <p className="connect-state">
          <Icon name="check" />
          {C.isContact}
        </p>
      ) : state === "requested" ? (
        <>
          <button type="button" className="btn ghost" style={{ marginTop: 24 }} aria-pressed="true" onClick={() => requestContact(c, false)}>
            <Icon name="check" />
            {C.requestSent}
          </button>
          <p className="hint" style={{ textAlign: "center" }}>
            {C.requestHint}
          </p>
        </>
      ) : (
        <button type="button" className="btn" style={{ marginTop: 24 }} onClick={() => requestContact(c, true)}>
          <Icon name="users" />
          {C.request}
        </button>
      )}

      <AiCard prompt={COPY.ai.coincidencias} insight={recommend(myTopics, { name: c.person.displayName, topics: c.person.topics, items: c.items })} />

      <div className="sec">{C.common}</div>
      <p style={{ margin: 0 }}>{c.items.map(matchPhrase).join(" · ")}</p>

      {rest.length > 0 && (
        <>
          <div className="sec">{C.rest}</div>
          <MoreTopics topics={rest} />
        </>
      )}

    </>
  );
}
