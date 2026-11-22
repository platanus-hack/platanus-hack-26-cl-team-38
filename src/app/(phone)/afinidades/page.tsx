"use client";

import { useRouter } from "next/navigation";
import { AffinityGraph } from "../_components/affinity-graph";
import { AiCard, MoreTopics } from "../_components/ai-card";
import { Avatar } from "../_components/avatar";
import { Sheet, Splash, TabBar, useOnboardedPhone } from "../_components/chrome";
import { Icon } from "../_components/icons";
import { setFocus } from "../_components/match-graph";
import { BackLink, Mono } from "../_components/ui";
import { COPY } from "../_lib/copy";
import { discover } from "../_lib/insight";
import { matchPhrase } from "../_lib/matches";
import { byTopic, cap, fmtDistance, myInterests, RELATION, relTime, searchTopics } from "../_lib/people";
import { useContacts } from "../_lib/plans";
import { setPhone } from "../_lib/store";

const C = COPY.afinidades;

export default function AfinidadesPage() {
  const s = useOnboardedPhone();
  const router = useRouter();
  const known = useContacts(s);
  if (!s) return <Splash />;

  const contacts = known ?? [];
  const person = contacts.find((c) => c.person.personId === s.focus.person);
  const query = s.affinityQuery ?? "";
  const found = searchTopics(contacts, query);
  const search = (q: string) => setPhone({ affinityQuery: q });
  // Suggestions complete what you typed; once it is a whole topic, they step aside.
  // Pre-filters: the topics you share with your contacts first, then what most of them have.
  const count = new Map<string, number>();
  for (const c of contacts) for (const t of c.person.topics) count.set(cap(t.name), (count.get(cap(t.name)) ?? 0) + 1);
  const frequent = [...count].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const common = [...new Set([...byTopic(contacts).map((g) => cap(g.topic)), ...frequent])].slice(0, 8);
  const same = (t: string) => t.toLowerCase() === query.trim().toLowerCase();
  const suggestions = found?.topics.filter((t) => t.toLowerCase() !== query.trim().toLowerCase()).slice(0, 4) ?? [];

  return (
    <div className="app with-tabs">
      <div className="graph-screen">
        <div className="head" style={{ pointerEvents: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BackLink fallback="/" style={{ display: "inline-flex", transform: "scaleX(-1)", padding: 8, margin: -8 }} />
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
          {common.length > 0 && (
            <div className="gsearch-out" role="group" aria-label={C.common}>
              {common.map((t) => (
                <button key={t} type="button" className="gsuggest" aria-pressed={same(t)} onClick={() => search(same(t) ? "" : t)}>
                  {t}
                </button>
              ))}
            </div>
          )}
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
        {known === undefined ? (
          <div className="empty">{COPY.coincidencias.loading}</div>
        ) : (
          <div className="gwrap">
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
            {/* There is no one-to-one chat: with one person it is still an Iniciativa, of two. */}
            <button
              type="button"
              className="btn"
              style={{ marginTop: 32 }}
              onClick={() => {
                setPhone({ invite: person.person.personId });
                setFocus({ person: null });
                router.push("/iniciativa");
              }}
            >
              <Icon name="sparkle" />
              {COPY.startInitiative}
            </button>
          </>
        )}
      </Sheet>
      <TabBar />
    </div>
  );
}
