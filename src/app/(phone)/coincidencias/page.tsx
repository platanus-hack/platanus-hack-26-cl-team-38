"use client";

import Link from "next/link";
import type { PublicTopic } from "@/lib/types";
import { AiCard, MoreTopics } from "../_components/ai-card";
import { Avatar } from "../_components/avatar";
import { Sheet, Splash, TabBar, useOnboardedPhone } from "../_components/chrome";
import { Icon } from "../_components/icons";
import { MatchGraph, setFocus } from "../_components/match-graph";
import { ListRow, Mono } from "../_components/ui";
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
  myInterests,
  RELATION,
  relTime,
  useEncounters,
} from "../_lib/people";
import { getPhone, setPhone } from "../_lib/store";
import { toast } from "../_lib/toast";

const C = COPY.coincidencias;

export default function CoincidenciasPage() {
  const s = useOnboardedPhone();
  const encounters = useEncounters();
  if (!s) return <Splash />;

  const radius = clampRadius(s.radiusM);
  const coins = encounters ? coincidences(s, encounters) : [];
  const groups = byTopic(coins);
  const selected = groups.find((g) => g.topic === s.focus.topic);
  const person = coins.find((c) => c.person.personId === s.focus.person);
  const close = () => setFocus({ topic: null, person: null });
  const near = s.nearOnly ?? true;

  return (
    <div className="app with-tabs">
      <div className="graph-screen">
        <div className="head">
          <h1 className="t-title">{C.title}</h1>
          <p className="desc">{C.desc}</p>
          <div className="near-row">
            <Mono className="mute">
              {coins.length} · {near ? `${radius} m` : C.anyDistance}
              {DEMO && !s.locationOn ? ` · ${C.demoShort}` : ""}
            </Mono>
            <label className="near-switch">
              <span>{C.near}</span>
              <button type="button" role="switch" aria-checked={near} aria-label={C.near} className="switch" onClick={() => setPhone({ nearOnly: !near })} />
            </label>
          </div>
        </div>
        {encounters === undefined ? (
          <div className="empty">{C.loading}</div>
        ) : groups.length === 0 ? (
          <div className="empty">
            <div className="empty-state">
              <p>{near ? C.empty : C.emptyAll}</p>
              {near && (
                <button type="button" className="btn light" onClick={() => setPhone({ nearOnly: false })}>
                  {C.widen}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="gwrap">
            <MatchGraph W={360} H={400} compact me={{ id: s.personId, name: s.displayName }} groups={groups} focus={s.focus} />
          </div>
        )}
      </div>

      <Sheet open={!!selected || !!person} size={person ? "detail" : "list"} onClose={close} label={selected?.topic ?? ""}>
        {person ? (
          <PersonSummary key={person.person.personId} c={person} myTopics={myInterests(s)} />
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
                    data={`${c.distanceM} m`}
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

function setRelation(personId: string, name: string, rel: "amigo" | "conocido" | null) {
  const next = { ...getPhone().relations };
  if (rel) next[personId] = rel;
  else delete next[personId];
  setPhone({ relations: next });
  toast(rel ? `${name} agregado como ${RELATION[rel].label}` : `${name} ya no está en tus contactos`);
}

/** Someone's public information, summarized, and the way to add them as Amigo or Conocido. */
function PersonSummary({ c, myTopics }: { c: Coincidence; myTopics: PublicTopic[] }) {
  const shared = new Set(c.items.map((i) => i.topic));
  const rest = c.person.topics.filter((t) => !shared.has(t.name));
  const mine = getPhone().relations?.[c.person.personId] ?? null;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Avatar id={c.person.personId} className="md-face" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="t-title">{c.person.displayName}</h2>
          <span className={`rel ${c.relation}`}>{RELATION[c.relation].label}</span>{" "}
          <Mono className="mute">
            · {c.distanceM} m · {c.place} · {relTime(c.at)}
          </Mono>
        </div>
      </div>

      <div className="segbar" role="radiogroup" aria-label="Agregar como" style={{ marginTop: 24 }}>
        {(["amigo", "conocido"] as const).map((rel) => (
          <button key={rel} type="button" role="radio" aria-checked={mine === rel} onClick={() => setRelation(c.person.personId, c.person.displayName, mine === rel ? null : rel)}>
            {mine === rel ? `${RELATION[rel].label} ✓` : `Agregar como ${RELATION[rel].label}`}
          </button>
        ))}
      </div>

      <AiCard prompt={COPY.ai.coincidencias} insight={recommend(myTopics, { name: c.person.displayName, topics: c.person.topics, items: c.items })} />

      <div className="sec">{C.common}</div>
      <p style={{ margin: 0 }}>{c.items.map(matchPhrase).join(" · ")}</p>

      {rest.length > 0 && (
        <>
          <div className="sec">{C.rest}</div>
          <MoreTopics topics={rest} />
        </>
      )}

      <Link className="btn" href={`/conversaciones/${encodeURIComponent(c.person.personId)}`} style={{ marginTop: 32 }}>
        <Icon name="chat" />
        {COPY.startConversation}
      </Link>
    </>
  );
}
