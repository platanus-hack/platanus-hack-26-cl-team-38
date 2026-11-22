"use client";

import type { PublicTopic } from "@/lib/types";
import { AiCard, MoreTopics } from "./ai-card";
import { Avatar } from "./avatar";
import { Sheet } from "./chrome";
import { Icon } from "./icons";
import { setFocus } from "./match-graph";
import { ListRow, Mono } from "./ui";
import { api } from "../_lib/api";
import { COPY } from "../_lib/copy";
import { recommend } from "../_lib/insight";
import { matchPhrase } from "../_lib/matches";
import { byTopic, cap, type Coincidence, DEMO, fmtMeters, myInterests, RELATION, relTime } from "../_lib/people";
import { useContacts } from "../_lib/plans";
import { getPhone, type PhoneState, setPhone } from "../_lib/store";
import { toast } from "../_lib/toast";

const C = COPY.coincidencias;
const near = (m: number) => (m === 0 ? C.here : fmtMeters(m));

/** The Interés you opened in a graph (who shares it), or the person you tapped (their summary). */
export function CoincidenceSheet({ s, coins }: { s: PhoneState; coins: Coincidence[] }) {
  const contacts = useContacts(s);
  const groups = byTopic(coins);
  const selected = groups.find((g) => g.topic === s.focus.topic);
  const person = coins.find((c) => c.person.personId === s.focus.person);
  return (
    <Sheet open={!!selected || !!person} size={person ? "detail" : "list"} onClose={() => setFocus({ topic: null, person: null })} label={selected?.topic ?? ""}>
      {person ? (
        <PersonSummary
          key={person.person.personId}
          c={person}
          myTopics={myInterests(s)}
          state={contacts?.some((x) => x.person.personId === person.person.personId) ? "contact" : (s.requests ?? []).includes(person.person.personId) ? "requested" : "none"}
        />
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
                  data={near(c.distanceM)}
                  onClick={() => setFocus({ person: c.person.personId })}
                />
              ))}
            </div>
          </>
        )
      )}
    </Sheet>
  );
}

/** Asks to become Contactos (or takes the request back). It is a connection: both must accept. */
async function requestContact(c: Coincidence, on: boolean) {
  const { personId, displayName: name } = c.person;
  const mark = (add: boolean) => setPhone((p) => ({ requests: add ? [...new Set([...(p.requests ?? []), personId])] : (p.requests ?? []).filter((id) => id !== personId) }));
  mark(on);
  // Demo mode has no backend: the request stays pending on this phone.
  if (DEMO) return toast(on ? C.requested(name) : C.requestCanceled);
  const body = { personId: getPhone().personId, otherId: personId, action: on ? "propose" : "close", ...(on ? { origin: { place: c.place || "Cerca tuyo" } } : {}) };
  const reply = await api("/api/connections", { method: "POST", body: JSON.stringify(body) })
    .then(async (r) => (r.ok ? ((await r.json()) as { connection: { status: string } | null }) : null))
    .catch(() => null);
  if (!on) return toast(C.requestCanceled);
  if (!reply) return (mark(false), toast(C.connectFailed));
  // Asking someone who had already asked you is accepting.
  toast(reply.connection?.status === "aceptada" ? C.nowContact(name) : C.requested(name));
}

/** Someone's public information, summarized, and the way to ask them to be your Contacto. */
function PersonSummary({ c, myTopics, state }: { c: Coincidence; myTopics: PublicTopic[]; state: "none" | "requested" | "contact" }) {
  const shared = new Set(c.items.map((i) => i.topic));
  const rest = c.person.topics.filter((t) => !shared.has(t.name));
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Avatar id={c.person.personId} className="md-face" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="t-title">{c.person.displayName}</h2>
          <span className={`rel ${c.relation}`}>{RELATION[c.relation].label}</span>{" "}
          <Mono className="mute">
            · {near(c.distanceM)} · {c.place} · {relTime(c.at)}
          </Mono>
        </div>
      </div>

      {state === "contact" ? (
        <p className="connect-state">
          <Icon name="check" />
          {C.isContact}
        </p>
      ) : state === "requested" ? (
        <>
          <button type="button" className="btn ghost" style={{ marginTop: 24 }} aria-pressed="true" onClick={() => requestContact(c, false)}>
            <Icon name="check" />
            {C.requestSent}
          </button>
          <p className="hint" style={{ textAlign: "center" }}>
            {C.requestHint}
          </p>
        </>
      ) : (
        <button type="button" className="btn" style={{ marginTop: 24 }} onClick={() => requestContact(c, true)}>
          <Icon name="users" />
          {C.request}
        </button>
      )}

      <AiCard prompt={COPY.ai.coincidencias} insight={recommend(myTopics, { name: c.person.displayName, topics: c.person.topics, items: c.items })} />

      <div className="sec">{C.common}</div>
      <p style={{ margin: 0 }}>{c.items.map(matchPhrase).join(" · ")}</p>

      {rest.length > 0 && (
        <>
          <div className="sec">{C.rest}</div>
          <MoreTopics topics={rest} />
        </>
      )}

    </>
  );
}
