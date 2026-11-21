"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "./_components/avatar";
import { Splash, TabBar, useOnboardedPhone } from "./_components/chrome";
import { setFocus } from "./_components/match-graph";
import { MingaMark } from "./_components/minga-mark";
import { Typewriter } from "./_components/typewriter";
import { Field, Mono, Why } from "./_components/ui";
import { COPY } from "./_lib/copy";
import { affinities, cap, type Coincidence, coincidences, RELATION, useEncounters } from "./_lib/people";
import { setPhone } from "./_lib/store";

const C = COPY.inicio;

/** In the carousel, anyone who is not a friend or an acquaintance shows as a Coincidencia. */
const kind = (c: Coincidence) => (c.relation === "amigo" || c.relation === "conocido" ? c.relation : "coincidencia");

export default function Home() {
  const s = useOnboardedPhone();
  const router = useRouter();
  const encounters = useEncounters();
  const [draft, setDraft] = useState<string | null>(null);

  if (!s) return <Splash />;
  const coins = encounters ? coincidences(s, encounters) : undefined;
  const contacts = encounters ? affinities(s, encounters) : [];
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
            {C.nearEmpty}
          </p>
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
          maxLength={280}
          value={text}
          placeholder={C.placeholder}
          done={saved}
          onChange={setDraft}
          onSubmit={() => {
            setPhone({ intent: text.trim() });
            setDraft(null);
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
          {saved && text && <Mono className="mute">{C.saved}</Mono>}
          <span style={{ marginLeft: "auto" }}>
            <Why text={C.intentHelp} />
          </span>
        </div>

        <Link href="/afinidades" className="aff-entry">
          <span className="stack">
            {contacts.slice(0, 4).map((c) => (
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
      </section>
      <TabBar />
    </div>
  );
}
