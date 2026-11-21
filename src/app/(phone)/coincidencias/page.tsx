"use client";

import { Avatar } from "../_components/avatar";
import { Sheet, Splash, TabBar, useOnboardedPhone } from "../_components/chrome";
import { MatchGraph, setFocus } from "../_components/match-graph";
import { ListRow, Mono, Tags } from "../_components/ui";
import { COPY } from "../_lib/copy";
import { matchPhrase } from "../_lib/matches";
import {
  byTopic,
  cap,
  clampRadius,
  type Coincidence,
  coincidences,
  DEMO,
  RANGE,
  RELATION,
  relTime,
  useEncounters,
} from "../_lib/people";
import { getPhone, setPhone } from "../_lib/store";

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
  const fill = ((radius - RANGE.min) / (RANGE.max - RANGE.min)) * 100;

  return (
    <div className="app with-tabs">
      <div className="graph-screen">
        <div className="head">
          <h1 className="t-title">{C.title}</h1>
          <p className="desc">{C.desc}</p>
          <Mono className="mute">
            {coins.length} · {radius} m{DEMO && !s.locationOn ? ` · ${C.demo}` : ""}
          </Mono>
        </div>
        {encounters === undefined ? (
          <div className="empty">{C.loading}</div>
        ) : groups.length === 0 ? (
          <div className="empty">{C.empty}</div>
        ) : (
          <div className="gwrap" style={{ inset: "148px 0 184px" }}>
            <MatchGraph W={360} H={400} compact me={{ id: s.personId, name: s.displayName }} groups={groups} focus={s.focus} />
          </div>
        )}
        <label className="range">
          <span className="sr">Distancia</span>
          <input
            type="range"
            min={RANGE.min}
            max={RANGE.max}
            step={RANGE.step}
            value={radius}
            style={{ ["--fill" as string]: `${fill}%` }}
            onChange={(e) => setPhone({ radiusM: Number(e.target.value) })}
            aria-valuetext={`${radius} metros`}
          />
          <Mono>{radius} m</Mono>
        </label>
      </div>

      <Sheet open={!!selected || !!person} size={person ? "detail" : "list"} onClose={close} label={selected?.topic ?? ""}>
        {person ? (
          <PersonSummary c={person} onBack={() => setFocus({ person: null })} />
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

function setRelation(personId: string, rel: "amigo" | "conocido" | null) {
  const next = { ...getPhone().relations };
  if (rel) next[personId] = rel;
  else delete next[personId];
  setPhone({ relations: next });
}

/** Someone's public information, summarized, and the way to add them as Amigo or Conocido. */
function PersonSummary({ c, onBack }: { c: Coincidence; onBack: () => void }) {
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
          <button key={rel} type="button" role="radio" aria-checked={mine === rel} onClick={() => setRelation(c.person.personId, mine === rel ? null : rel)}>
            {mine === rel ? `${RELATION[rel].label} ✓` : `Agregar como ${RELATION[rel].label}`}
          </button>
        ))}
      </div>

      <div className="sec">{C.common}</div>
      <p style={{ margin: 0 }}>{c.items.map(matchPhrase).join(" · ")}</p>

      {rest.length > 0 && (
        <>
          <div className="sec">{C.rest}</div>
          <Tags topics={rest.slice(0, 14).map((t) => ({ ...t, name: cap(t.name) }))} />
        </>
      )}

      <div className="rows" style={{ marginTop: 24 }}>
        <ListRow title={C.conversation} href={`/conversaciones/${encodeURIComponent(c.person.personId)}`} chevron />
        <ListRow title="Volver" onClick={onBack} className="off" />
      </div>
    </>
  );
}
