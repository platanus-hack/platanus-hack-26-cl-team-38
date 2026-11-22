"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "./_components/avatar";
import { Sheet, Splash, TabBar, useOnboardedPhone } from "./_components/chrome";
import { MingaMark } from "./_components/minga-mark";
import { Icon } from "./_components/icons";
import { Field, ListRow, Mono } from "./_components/ui";
import { buildInitiative, localInitiatives } from "./_lib/conversations";
import { COPY } from "./_lib/copy";
import { affinities, relTime, useEncounters } from "./_lib/people";
import { useContacts } from "./_lib/plans";
import { setPhone } from "./_lib/store";

const C = COPY.inicio;

export default function Home() {
  const s = useOnboardedPhone();
  const router = useRouter();
  const encounters = useEncounters();
  const known = useContacts(s);
  const [draft, setDraft] = useState<string | null>(null);
  const [how, setHow] = useState(false);

  if (!s) return <Splash />;
  const everyone = encounters ? affinities(s, encounters) : [];
  const contacts = known ?? [];
  const initiatives = (encounters ? localInitiatives(s, encounters) : []).map((i) => buildInitiative(s.displayName, i, everyone));
  const invited = contacts.find((c) => c.person.personId === s.invite);
  const text = draft ?? s.intent;
  const saved = draft === null ? !!s.intent : draft.trim() === s.intent;

  return (
    <div className="app with-tabs home">
      <header className="topbar">
        <MingaMark />
        {COPY.app}
        {/* Your Contactos, small: the faces lead to the whole view (or to Explorar while you have none). */}
        {known && (
          <Link href={contacts.length ? "/afinidades" : "/coincidencias"} className="home-contacts" aria-label={contacts.length ? `${C.contacts}: ${contacts.length}` : C.contactsHint}>
            <span className="stack">
              {contacts.slice(0, 3).map((c) => (
                <Avatar key={c.person.personId} id={c.person.personId} />
              ))}
            </span>
            {contacts.length > 3 ? <Mono>+{contacts.length - 3}</Mono> : contacts.length === 0 ? <Icon name="users" /> : null}
          </Link>
        )}
      </header>

      <div className="content">
        <div className="home-title">
          <h1 className="t-hero">{C.titles[0]}</h1>
          <button type="button" className="q" aria-haspopup="dialog" aria-label={C.howTitle} onClick={() => setHow(!how)}>
            i
          </button>
        </div>
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
        {invited && (
          <p className="hint">
            {C.with(invited.person.displayName)}{" "}
            <button type="button" className="link" onClick={() => setPhone({ invite: null })}>
              {C.withRemove}
            </button>
          </p>
        )}
        {initiatives.length > 0 && (
          <>
            <div className="sec">{C.initiatives}</div>
            <div className="rows">
              {initiatives.map((cv) => (
                <ListRow
                  key={cv.id}
                  lead={
                    <span className="stack">
                      {cv.members.slice(0, 2).map((m) => (
                        <Avatar key={m.person.personId} id={m.person.personId} />
                      ))}
                    </span>
                  }
                  title={cv.theme}
                  sub={cv.members.map((m) => m.person.displayName.split(" ")[0]).join(", ")}
                  data={<Mono>{relTime(cv.at).replace("hace ", "")}</Mono>}
                  href={`/conversaciones/${encodeURIComponent(cv.id)}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* A sheet opens over the tab bar, so the whole explanation fits on screen. */}
      <Sheet open={how} size="auto" onClose={() => setHow(false)} label={C.howTitle}>
        <h2 className="t-title">{C.howTitle}</h2>
        <ol className="how">
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
        <button type="button" className="btn" onClick={() => setHow(false)}>
          {C.howMore}
        </button>
      </Sheet>
      <TabBar />
    </div>
  );
}
