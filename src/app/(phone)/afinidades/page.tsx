"use client";

import Link from "next/link";
import { AffinityGraph } from "../_components/affinity-graph";
import { Avatar } from "../_components/avatar";
import { Sheet, Splash, TabBar, useOnboardedPhone } from "../_components/chrome";
import { Icon } from "../_components/icons";
import { setFocus } from "../_components/match-graph";
import { Mono, Tags } from "../_components/ui";
import { COPY } from "../_lib/copy";
import { matchPhrase } from "../_lib/matches";
import { affinities, cap, fmtDistance, RELATION, relTime, useEncounters } from "../_lib/people";

const C = COPY.afinidades;

export default function AfinidadesPage() {
  const s = useOnboardedPhone();
  const encounters = useEncounters();
  if (!s) return <Splash />;

  const contacts = encounters ? affinities(s, encounters) : [];
  const person = contacts.find((c) => c.person.personId === s.focus.person);

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
        </div>
        {encounters === undefined ? (
          <div className="empty">{COPY.coincidencias.loading}</div>
        ) : (
          <div className="gwrap" style={{ inset: "136px 0 104px" }}>
            <AffinityGraph W={360} H={460} me={{ id: s.personId }} contacts={contacts} focus={s.focus.person} />
          </div>
        )}
      </div>

      <Sheet open={!!person} size="list" onClose={() => setFocus({ person: null })} label={person?.person.displayName ?? ""}>
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
            <div className="sec">{C.common}</div>
            {person.items.length ? <p style={{ margin: 0 }}>{person.items.map(matchPhrase).join(" · ")}</p> : <p className="mute">{C.nothing}</p>}
            <div className="sec">{C.rest}</div>
            <Tags topics={person.person.topics.filter((t) => !person.items.some((i) => i.topic === t.name)).slice(0, 14).map((t) => ({ ...t, name: cap(t.name) }))} />
          </>
        )}
      </Sheet>
      <TabBar />
    </div>
  );
}
