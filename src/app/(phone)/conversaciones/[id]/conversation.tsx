"use client";

import { use, useEffect, useRef, useState } from "react";
import { Avatar } from "../../_components/avatar";
import { Splash, TabBar, useOnboardedPhone } from "../../_components/chrome";
import { Icon } from "../../_components/icons";
import { LargeTitle, Mono } from "../../_components/ui";
import { allConversations, buildConversation, buildInitiative } from "../../_lib/conversations";
import { COPY } from "../../_lib/copy";
import { matchPhrase } from "../../_lib/matches";
import { affinities, byTopic, coincidences, DEMO, RANGE, useEncounters } from "../../_lib/people";
import { setPhone } from "../../_lib/store";
import { toast } from "../../_lib/toast";

const time = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit" });
const C = COPY.conversaciones;

/** You speak (from "yo"), and your Agente answers in the thread right after. Stamped outside render. */
function say(convId: string, mine: string, agent: string) {
  const now = Date.now();
  const add = [
    { id: `${convId}-y${now}`, from: "yo", text: mine, at: new Date(now).toISOString() },
    { id: `${convId}-a${now}`, from: "me", text: agent, at: new Date(now + 1500).toISOString() },
  ];
  setPhone((p) => ({ replies: { ...(p.replies ?? {}), [convId]: [...(p.replies?.[convId] ?? []), ...add] } }));
}

export function Conversation({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent(use(params).id);
  const s = useOnboardedPhone();
  const encounters = useEncounters();
  if (!s || !encounters) return <Splash />;

  const coins = DEMO ? coincidences({ ...s, radiusM: RANGE.max }, encounters) : [];
  // Someone from Afinidades you share nothing with yet still gets a Conversación when you start one.
  const contact = DEMO ? affinities(s, encounters).find((c) => c.person.personId === id) : undefined;
  const init = s.initiatives?.find((i) => i.id === id);
  const cv = init
    ? buildInitiative(s.displayName, init, affinities(s, encounters))
    : (allConversations(s.displayName, coins, byTopic(coins)).find((c) => c.id === id) ?? (contact && buildConversation(s.displayName, contact)));
  const names = Object.fromEntries((cv?.members ?? []).map((m) => [m.person.personId, m.person.displayName]));
  const group = cv?.kind === "grupo";
  const messages = cv ? [...cv.messages, ...(s.replies?.[cv.id] ?? [])] : [];

  return (
    <div className="app with-tabs">
      <LargeTitle
        title={!cv ? COPY.conversaciones.title : group ? (cv.theme ?? "") : cv.members[0].person.displayName}
        back="/conversaciones"
        sub={
          cv && (
            <Mono className="mute">
              {group
                ? `${cv.label ?? "Temática"} · ${cv.members.length + 1} Agentes · ${cv.members.map((m) => m.person.displayName).join(", ")}`
                : [`${cv.members[0].distanceM} m`, cv.members[0].place, ...cv.members[0].items.map(matchPhrase)].join(" · ")}
            </Mono>
          )
        }
      />
      {!cv ? (
        <p className="mute content">{COPY.conversaciones.notFound}</p>
      ) : (
        <div className="thread">
          {messages.map((m, i) => {
            const next = messages[i + 1];
            const last = !next || next.from !== m.from;
            const yo = m.from === "yo";
            const mine = m.from === "me" || yo;
            return (
              <div key={m.id} style={{ display: "contents" }}>
                {yo ? (
                  <div className="bubble yo">
                    <span className="who">{C.yourself}</span>
                    {m.text}
                  </div>
                ) : mine || !group ? (
                  <div className={`bubble${mine ? " me" : ""}`}>{m.text}</div>
                ) : (
                  <div className="msg">
                    <Avatar id={m.from} />
                    <div className="bubble">
                      <span className="who">Agente de {names[m.from]}</span>
                      {m.text}
                    </div>
                  </div>
                )}
                {last && <Mono className={`stamp${mine ? " me" : ""}`}>{time.format(new Date(m.at))}</Mono>}
              </div>
            );
          })}
        </div>
      )}
      {cv && <Actions convId={cv.id} name={s.displayName} count={messages.length} />}
      <TabBar />
    </div>
  );
}

/** What you can do after the Agentes talk: confirm, ask for another date, or tell your Agente something. */
function Actions({ convId, name, count }: { convId: string; name: string; count: number }) {
  const [text, setText] = useState("");
  const seen = useRef(count);
  // New messages bring the thread down to them.
  useEffect(() => {
    if (count > seen.current) {
      // The phone scrolls the page; the desktop frame scrolls its own screen.
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      document.querySelector(".device-screen .app")?.scrollTo({ top: 1e6, behavior: "smooth" });
    }
    seen.current = count;
  }, [count]);
  const send = () => {
    const t = text.trim();
    if (!t) return;
    say(convId, t, `Entendido. Lo llevo a la Conversación: «${t}».`);
    setText("");
  };
  return (
    <div className="conv-actions">
      <div className="conv-quick">
        <button
          type="button"
          onClick={() => {
            say(convId, C.confirm, `${name} confirmó. Les aviso a todos cuando el resto confirme.`);
            toast(C.confirmed);
          }}
        >
          <Icon name="check" />
          {C.confirm}
        </button>
        <button type="button" onClick={() => say(convId, C.otherDateAsk, `${name} propone otra fecha. ¿Qué día les acomoda a cada uno?`)}>
          <Icon name="clock" />
          {C.otherDate}
        </button>
      </div>
      <form
        className="conv-say"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input value={text} placeholder={C.tellAgent} aria-label={C.tellAgent} maxLength={280} onChange={(e) => setText(e.target.value)} enterKeyHint="send" />
        <button type="submit" aria-label="Enviar" disabled={!text.trim()}>
          <Icon name="send" />
        </button>
      </form>
    </div>
  );
}
