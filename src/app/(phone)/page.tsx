"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandBar } from "./_components/brand-bar";
import { Sheet, Splash, TabBar, useOnboardedPhone } from "./_components/chrome";
import { CoincidenceSheet } from "./_components/coincidence-sheet";
import { MatchGraph, setFocus } from "./_components/match-graph";
import { Icon } from "./_components/icons";
import { NearFilters } from "./_components/near-filters";
import { RotatingLine } from "./_components/rotating-line";
import { Field, Mono } from "./_components/ui";
import { COPY } from "./_lib/copy";
import { byTopic, clampRadius, coincidences, fmtMeters, isVisible } from "./_lib/people";
import { useNearby } from "./_lib/proximity";
import { useContacts } from "./_lib/plans";
import { setPhone } from "./_lib/store";

const C = COPY.inicio;
const X = COPY.coincidencias;

export default function Home() {
  const s = useOnboardedPhone();
  const router = useRouter();
  // The Intereses graph shows the same people as Explorar: only who is in range.
  const { encounters: near } = useNearby(s);
  const known = useContacts(s);
  const [draft, setDraft] = useState<string | null>(null);
  const [how, setHow] = useState(false);
  // Explorar shares the focus: what was open there should not open here.
  useEffect(() => setFocus({ topic: null, person: null }), []);

  if (!s) return <Splash />;
  const contacts = known ?? [];
  const invited = contacts.find((c) => c.person.personId === s.invite);
  const text = draft ?? s.intent;
  const saved = draft === null ? !!s.intent : draft.trim() === s.intent;
  const visible = isVisible(s);
  const coins = near && visible ? coincidences(s, near) : [];
  const groups = byTopic(coins);

  return (
    <div className="app with-tabs home">
      <BrandBar contacts={known} />

      <div className="content">
        <div className="home-title">
          <h1 className="t-hero">{C.titles[0]}</h1>
          <button
            type="button"
            className="q"
            aria-haspopup="dialog"
            aria-label={C.howTitle}
            onClick={() => setHow(!how)}
          >
            i
          </button>
        </div>
        <RotatingLine lines={C.tips} />
        <div className="sec home-near">
          <span className="tools">
            {visible && <Mono>{fmtMeters(clampRadius(s.radiusM))}</Mono>}
            <NearFilters s={s} id="home-filters" />
          </span>
        </div>
        <div className="home-graph">
          {near === undefined ? (
            <div className="empty">{X.loading}</div>
          ) : !visible ? (
            <div className="empty">
              <div className="empty-state">
                <p>{X.invisible}</p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setPhone({ privacy: { ...s.privacy, discoverable: true } })}
                >
                  {X.turnVisible}
                </button>
              </div>
            </div>
          ) : groups.length === 0 ? (
            <div className="empty">
              <p>{X.nobody(clampRadius(s.radiusM))}</p>
            </div>
          ) : (
            <MatchGraph
              W={360}
              H={360}
              compact
              me={{ id: s.personId, name: s.displayName }}
              groups={groups}
              focus={s.focus}
            />
          )}
        </div>
      </div>

      {/* The question sits at the bottom, over the tab bar, like a message box. */}
      <div className="home-ask">
        {invited && (
          <p className="hint">
            {C.with(invited.person.displayName)}{" "}
            <button type="button" className="link" onClick={() => setPhone({ invite: null })}>
              {C.withRemove}
            </button>
          </p>
        )}
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
      <CoincidenceSheet s={s} coins={coins} />
      <TabBar />
    </div>
  );
}
