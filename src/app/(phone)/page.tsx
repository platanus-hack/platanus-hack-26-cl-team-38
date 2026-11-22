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
import { allConversations, buildInitiative, type Conversation } from "./_lib/conversations";
import { COPY } from "./_lib/copy";
import { affinities, byTopic, contactsOf, cap, type Coincidence, coincidences, DEMO, RANGE, RELATION, relTime, useEncounters } from "./_lib/people";
import { setPhone } from "./_lib/store";

const C = COPY.inicio;

export default function Home() {
  const s = useOnboardedPhone();
  const router = useRouter();
  const encounters = useEncounters();
  const [draft, setDraft] = useState<string | null>(null);
  const [how, setHow] = useState(false);

  if (!s) return <Splash />;
  const everyone = encounters ? affinities(s, encounters) : [];
  const contacts = encounters ? contactsOf(s, encounters) : [];
  const initiatives = (s.initiatives ?? []).map((i) => buildInitiative(s.displayName, i, everyone));
  // Recientes: the latest Chats (at most three).
  const logged = encounters && DEMO ? coincidences({ ...s, nearOnly: true, radiusM: RANGE.max }, encounters) : [];
  const recent = allConversations(s.displayName, logged, byTopic(logged))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 3);
  const text = draft ?? s.intent;
  const saved = draft === null ? !!s.intent : draft.trim() === s.intent;

  const open = (c: Coincidence) => {
    setFocus({ topic: null, person: c.person.personId });
    router.push("/afinidades");
  };
  const chatRow = (cv: Conversation) => (
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
  );

  return (
    <div className="app with-tabs">
      <header className="topbar">
        <MingaMark />
        {COPY.app}
      </header>
      <p className="tagline">{C.tagline}</p>

      <section className="near-wrap">
        <div className="sec">
          {C.contacts}
          {contacts.length > 0 && (
            <Link href="/afinidades" className="more">
              {C.seeAll}
            </Link>
          )}
        </div>
        {encounters && contacts.length === 0 ? (
          <p className="mute" style={{ margin: "8px 0 0" }}>
            {C.contactsEmpty}{" "}
            <Link href="/coincidencias" className="link">
              {C.contactsHint}
            </Link>
          </p>
        ) : contacts.length < 3 ? (
          // One or two people read better as rows than as a carousel with empty space.
          <div className="rows near-rows">
            {contacts.map((c) => (
              <ListRow
                key={c.person.personId}
                lead={<Avatar id={c.person.personId} className={c.relation} />}
                title={c.person.displayName}
                sub={
                  <>
                    <span className={`rel ${c.relation}`}>{RELATION[c.relation].label}</span>
                    {c.items[0] && ` · ${cap(c.items[0].topic)}`}
                  </>
                }
                onClick={() => open(c)}
                chevron
              />
            ))}
          </div>
        ) : (
          <div className="near">
            {contacts.slice(0, 8).map((c) => (
              <button key={c.person.personId} type="button" className="face" onClick={() => open(c)}>
                <Avatar id={c.person.personId} className={c.relation} />
                <span>{c.person.displayName}</span>
                <span className={`rel ${c.relation}`}>{RELATION[c.relation].label}</span>
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

        {initiatives.length > 0 && (
          <>
            <div className="sec">{C.initiatives}</div>
            <div className="rows">{initiatives.map(chatRow)}</div>
          </>
        )}

        {recent.length > 0 && (
          <>
            <div className="sec">
              {C.recent}
              <Link href="/conversaciones" className="more">
                {C.seeAll}
              </Link>
            </div>
            <div className="rows">{recent.map(chatRow)}</div>
          </>
        )}
      </section>
      <TabBar />
    </div>
  );
}
