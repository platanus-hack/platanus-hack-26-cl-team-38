"use client";

import { useState } from "react";
import { MoreTopics } from "./ai-card";
import { Avatar } from "./avatar";
import { Sheet } from "./chrome";
import { Mono } from "./ui";
import { COPY } from "../_lib/copy";
import { matchPhrase } from "../_lib/matches";
import { affinities, type Encounter, relTime } from "../_lib/people";
import { type Incoming, useIncoming } from "../_lib/requests";
import type { PhoneState } from "../_lib/store";

const C = COPY.solicitudes;

/** Aceptar and Rechazar, side by side: the same pair on the card and in the detail. */
function Answer({ r, answer }: { r: Incoming; answer: (r: Incoming, accept: boolean) => void }) {
  return (
    <div className="btn-pair">
      <button type="button" className="btn ghost" aria-label={`${C.reject}: ${r.displayName}`} onClick={() => answer(r, false)}>
        {C.reject}
      </button>
      <button type="button" className="btn" aria-label={`${C.accept}: ${r.displayName}`} onClick={() => answer(r, true)}>
        {C.accept}
      </button>
    </div>
  );
}

/** The requests to be your Contacto: answer right on the card, or open one to see who it is. */
export function Requests({ s, encounters }: { s: PhoneState; encounters: Encounter[] | undefined }) {
  const { list, answer } = useIncoming(s, encounters);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = list.find((r) => r.personId === openId);
  // What you have in common, when they are (or were) around.
  const detail = open && encounters ? affinities(s, encounters).find((c) => c.person.personId === open.personId) : undefined;
  if (list.length === 0) return null;

  return (
    <>
      <div className="sec u" style={{ marginTop: 8 }}>
        {C.title}
        <Mono className="mute">{list.length}</Mono>
      </div>
      <ul className="reqs">
        {list.map((r) => (
          <li key={r.personId} className="req">
            <button type="button" className="req-who" onClick={() => setOpenId(r.personId)}>
              <Avatar id={r.personId} />
              <span>
                <strong>{r.displayName}</strong>
                <span>
                  {C.wants} · {r.where}
                </span>
              </span>
              <Mono className="mute">{relTime(r.at).replace("hace ", "")}</Mono>
            </button>
            <Answer r={r} answer={answer} />
          </li>
        ))}
      </ul>

      <Sheet open={!!open} size="detail" onClose={() => setOpenId(null)} label={open?.displayName ?? ""}>
        {open && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Avatar id={open.personId} className="md-face" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 className="t-title">{open.displayName}</h2>
                <Mono className="mute">
                  {C.wants} · {open.where} · {relTime(open.at)}
                </Mono>
              </div>
            </div>
            <Answer r={open} answer={(r, accept) => (setOpenId(null), answer(r, accept))} />
            {detail && (
              <>
                <div className="sec">{C.common}</div>
                {detail.items.length ? <p style={{ margin: 0 }}>{detail.items.map(matchPhrase).join(" · ")}</p> : <p className="mute">{C.nothing}</p>}
                {detail.person.topics.length > 0 && (
                  <>
                    <div className="sec">{C.topics}</div>
                    <MoreTopics topics={detail.person.topics} limit={8} />
                  </>
                )}
              </>
            )}
          </>
        )}
      </Sheet>
    </>
  );
}
