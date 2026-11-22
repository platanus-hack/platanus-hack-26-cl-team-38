"use client";

import { use } from "react";
import { Avatar } from "../../_components/avatar";
import { Splash, TabBar, useOnboardedPhone } from "../../_components/chrome";
import { LargeTitle, Mono } from "../../_components/ui";
import { allConversations, buildConversation, buildInitiative } from "../../_lib/conversations";
import { COPY } from "../../_lib/copy";
import { matchPhrase } from "../../_lib/matches";
import { affinities, byTopic, coincidences, DEMO, RANGE, useEncounters } from "../../_lib/people";
import { isPlanId } from "../../_lib/plans";
import { PlanConversation } from "./plan";

const time = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit" });

export function Conversation({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent(use(params).id);
  const s = useOnboardedPhone();
  const encounters = useEncounters();
  if (s && !DEMO && isPlanId(id)) return <PlanConversation id={id} me={s.personId} />;
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
          {cv.messages.map((m, i) => {
            const next = cv.messages[i + 1];
            const last = !next || next.from !== m.from;
            const mine = m.from === "me";
            return (
              <div key={m.id} style={{ display: "contents" }}>
                {mine || !group ? (
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
      <TabBar />
    </div>
  );
}
