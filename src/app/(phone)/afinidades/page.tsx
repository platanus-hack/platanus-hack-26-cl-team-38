"use client";

import Link from "next/link";
import { AffinityGraph } from "../_components/affinity-graph";
import { AiCard, MoreTopics } from "../_components/ai-card";
import { Avatar } from "../_components/avatar";
import { Sheet, Splash, TabBar, useOnboardedPhone } from "../_components/chrome";
import { Icon } from "../_components/icons";
import { setFocus } from "../_components/match-graph";
import { Mono } from "../_components/ui";
import { COPY } from "../_lib/copy";
import { discover } from "../_lib/insight";
import { matchPhrase } from "../_lib/matches";
import { affinities, fmtDistance, myInterests, RELATION, relTime, searchTopics, useEncounters } from "../_lib/people";
import { setPhone } from "../_lib/store";

const C = COPY.afinidades;

export default function AfinidadesPage() {
  const s = useOnboardedPhone();
  const encounters = useEncounters();
  if (!s) return <Splash />;

  const contacts = encounters ? affinities(s, encounters) : [];
  const person = contacts.find((c) => c.person.personId === s.focus.person);
  const query = s.affinityQuery ?? "";
  const found = searchTopics(contacts, query);
  const search = (q: string) => setPhone({ affinityQuery: q });
  // Suggestions complete what you typed; once it is a whole topic, they step aside.
  const suggestions = found?.topics.filter((t) => t.toLowerCase() !== query.trim().toLowerCase()).slice(0, 4) ?? [];

  return (
    <div className="app with-tabs">
      <div className="graph-screen">
        <div className="head" style={{ pointerEvents: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link href="/" aria-label="Volver" style={{ display: "inline-flex", transform: "scaleX(-1)" }}>
              <Icon name="arrow" />
            </Link>
            <h1 className="t-title">{C.title}</h1>
          </div>
          <p className="desc">{C.desc}</p>
          <div className="gsearch" role="search">
            <Icon name="search" />
            <input type="search" value={query} placeholder={C.search} aria-label={C.search} enterKeyHint="search" onChange={(e) => search(e.target.value)} />
            {query && (
              <button type="button" aria-label={C.clear} onClick={() => search("")}>
                <Icon name="x" />
              </button>
            )}
          </div>
          {found && (
            <div className="gsearch-out" aria-live="polite">
              <Mono className="mute">
                {found.ids.size ? `${found.ids.size} ${found.ids.size === 1 ? C.one : C.many}` : C.noOne}
              </Mono>
              {suggestions.map((t) => (
                <button key={t} type="button" className="gsuggest" onClick={() => search(t)}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
        {encounters === undefined ? (
          <div className="empty">{COPY.coincidencias.loading}</div>
        ) : (
          <div className="gwrap" style={{ inset: "212px 0 104px" }}>
            <AffinityGraph W={360} H={460} me={{ id: s.personId }} contacts={contacts} focus={s.focus.person} match={found?.ids ?? null} />
          </div>
        )}
      </div>

      <Sheet open={!!person} size="detail" onClose={() => setFocus({ person: null })} label={person?.person.displayName ?? ""}>
        {person && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Avatar id={person.person.personId} className="md-face" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 className="t-title">{person.person.displayName}</h2>
                <span className={`rel ${person.relation}`}>{RELATION[person.relation].label}</span>{" "}
                <Mono className="mute">
                  · {fmtDistance(person.distanceM).replace(/^a /, "")} · {relTime(person.at)}
                </Mono>
              </div>
            </div>
            <AiCard
              key={person.person.personId}
              prompt={COPY.ai.afinidades}
              listLabel={COPY.ai.found}
              insight={discover(myInterests(s), { name: person.person.displayName, topics: person.person.topics, items: person.items })}
            />
            <div className="sec">{C.common}</div>
            {person.items.length ? <p style={{ margin: 0 }}>{person.items.map(matchPhrase).join(" · ")}</p> : <p className="mute">{C.nothing}</p>}
            <div className="sec">{C.rest}</div>
            <MoreTopics key={`m-${person.person.personId}`} topics={person.person.topics.filter((t) => !person.items.some((i) => i.topic === t.name))} />
            <Link className="btn" href={`/conversaciones/${encodeURIComponent(person.person.personId)}`} style={{ marginTop: 32 }}>
              <Icon name="chat" />
              {COPY.startConversation}
            </Link>
          </>
        )}
      </Sheet>
      <TabBar />
    </div>
  );
}
