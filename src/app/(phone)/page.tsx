"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "./_components/avatar";
import { Splash, TabBar, useOnboardedPhone } from "./_components/chrome";
import { setFocus } from "./_components/match-graph";
import { MingaMark } from "./_components/minga-mark";
import { Typewriter } from "./_components/typewriter";
import { Icon } from "./_components/icons";
import { Field, ListRow, Mono } from "./_components/ui";
import { allConversations, buildInitiative } from "./_lib/conversations";
import { COPY } from "./_lib/copy";
import { affinities, byTopic, cap, type Coincidence, coincidences, DEMO, RANGE, RELATION, relTime, useEncounters } from "./_lib/people";
import { setPhone } from "./_lib/store";

const C = COPY.inicio;

/** In the carousel, anyone who is not a friend or an acquaintance shows as a Coincidencia. */
const kind = (c: Coincidence) => (c.relation === "amigo" || c.relation === "conocido" ? c.relation : "coincidencia");

export default function Home() {
  const s = useOnboardedPhone();
  const router = useRouter();
  const encounters = useEncounters();
  const [draft, setDraft] = useState<string | null>(null);
  const [how, setHow] = useState(false);

  if (!s) return <Splash />;
  // "Cerca" on Inicio is always about who was near, whatever Coincidencias shows.
  const coins = encounters ? coincidences({ ...s, nearOnly: true }, encounters) : undefined;
  const contacts = encounters ? affinities(s, encounters) : [];
  // Recientes: your Iniciativas first, then the latest Conversaciones (at most three).
  const logged = encounters && DEMO ? coincidences({ ...s, nearOnly: true, radiusM: RANGE.max }, encounters) : [];
  const recent = [
    ...(s.initiatives ?? []).map((i) => buildInitiative(s.displayName, i, contacts)),
    ...allConversations(s.displayName, logged, byTopic(logged)),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 3);
  const text = draft ?? s.intent;
  const saved = draft === null ? !!s.intent : draft.trim() === s.intent;

  // Friends and acquaintances go to Afinidades; everyone else is a Coincidencia and goes there.
  const open = (c: Coincidence) => {
    const known = c.relation === "amigo" || c.relation === "conocido";
    setFocus({ topic: known ? null : (c.items[0]?.topic ?? null), person: c.person.personId });
    router.push(known ? "/afinidades" : "/coincidencias");
  };

  return (
    <div className="app with-tabs">
      <header className="topbar">
        <MingaMark />
        {COPY.app}
      </header>
      <p className="tagline">{C.tagline}</p>

      <section className="near-wrap">
        <div className="sec">
          {C.near}
          {coins && coins.length > 0 && (
            <Link href="/coincidencias" className="more">
              {C.seeAll}
            </Link>
          )}
        </div>
        {coins && coins.length === 0 ? (
          <p className="mute" style={{ margin: "8px 0 0" }}>
            {C.nearEmpty}{" "}
            {!s.locationOn && (
              <Link href="/perfil" className="link">
                {C.nearHint}
              </Link>
            )}
          </p>
        ) : coins && coins.length < 3 ? (
          // One or two people read better as rows than as a carousel with empty space.
          <div className="rows near-rows">
            {coins.map((c) => (
              <ListRow
                key={c.person.personId}
                lead={<Avatar id={c.person.personId} className={kind(c)} />}
                title={c.person.displayName}
                sub={
                  <>
                    <span className={`rel ${kind(c)}`}>{kind(c) === "coincidencia" ? C.coincidence : RELATION[c.relation].label}</span> · {cap(c.items[0]?.topic ?? "")}
                  </>
                }
                data={`${c.distanceM} m`}
                onClick={() => open(c)}
                chevron
              />
            ))}
          </div>
        ) : (
          <div className="near">
            {(coins ?? []).slice(0, 6).map((c) => (
              <button
                key={c.person.personId}
                type="button"
                className="face"
                onClick={() => open(c)}
              >
                <Avatar id={c.person.personId} className={kind(c)} />
                <span>{c.person.displayName}</span>
                <span className={`rel ${kind(c)}`}>{kind(c) === "coincidencia" ? C.coincidence : RELATION[c.relation].label}</span>
                <span className="topic">{cap(c.items[0]?.topic ?? "")}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="slate">
        <Typewriter className="t-hero hero" phrases={[...C.titles]} />
        <Field
          label={C.titles[0]}
          rows={2}
          send
          maxLength={280}
          value={text}
          placeholder={C.placeholder}
          done={saved}
          onChange={setDraft}
          onSubmit={() => {
            setPhone({ intent: text.trim() });
            setDraft(null);
            router.push("/iniciativa");
          }}
        />
        <div className="pitch">
          <p>{C.pitch}</p>
          <button type="button" className="q" aria-expanded={how} aria-controls="how" aria-label={C.howTitle} onClick={() => setHow(!how)}>
            i
          </button>
        </div>
        <div id="how" className={`how${how ? " open" : ""}`} aria-hidden={!how}>
          <div>
            <div className="how-title">{C.howTitle}</div>
            <ol>
              {C.how.map((h, i) => (
                <li key={h.title}>
                  <span className="how-ic">
                    <Icon name={h.icon} />
                  </span>
                  <span>
                    <span className="how-step mono">0{i + 1}</span>
                    <strong>{h.title}</strong>
                    {h.text}
                  </span>
                </li>
              ))}
            </ol>
            <button type="button" className="how-close" tabIndex={how ? 0 : -1} onClick={() => setHow(false)}>
              {C.howMore}
            </button>
          </div>
        </div>

        <Link href="/afinidades" className="aff-entry">
          <span className="stack">
            {contacts.slice(0, 3).map((c) => (
              <Avatar key={c.person.personId} id={c.person.personId} />
            ))}
          </span>
          <span className="main">
            <span style={{ display: "block" }}>{C.affinities}</span>
            <span className="sub">{C.affinitiesSub}</span>
          </span>
          <svg className="ic" aria-hidden="true" style={{ width: 16, height: 16, color: "var(--mute)" }}>
            <use href="#i-chev" />
          </svg>
        </Link>

        {recent.length > 0 && (
          <>
            <div className="sec">
              {C.recent}
              <Link href="/conversaciones" className="more">
                {C.seeAll}
              </Link>
            </div>
            <div className="rows">
              {recent.map((cv) => (
                <ListRow
                  key={cv.id}
                  lead={
                    <span className="stack">
                      {cv.members.slice(0, 2).map((m) => (
                        <Avatar key={m.person.personId} id={m.person.personId} />
                      ))}
                    </span>
                  }
                  title={cv.kind === "grupo" ? cv.theme : cv.members[0]?.person.displayName}
                  sub={cv.label ?? (cv.kind === "grupo" ? "Temática" : "Conversación")}
                  data={<Mono>{relTime(cv.at).replace("hace ", "")}</Mono>}
                  href={`/conversaciones/${encodeURIComponent(cv.id)}`}
                />
              ))}
            </div>
          </>
        )}
      </section>
      <TabBar />
    </div>
  );
}
