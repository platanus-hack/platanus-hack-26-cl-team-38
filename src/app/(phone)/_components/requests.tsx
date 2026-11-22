"use client";

import { useState } from "react";
import { MoreTopics } from "./ai-card";
import { Avatar } from "./avatar";
import { Sheet } from "./chrome";
import { Icon } from "./icons";
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

/** The requests to be your Contacto: one line that opens, a row each with reject and accept. */
export function Requests({ s, encounters }: { s: PhoneState; encounters: Encounter[] | undefined }) {
  const { list, answer } = useIncoming(s, encounters);
  const [expanded, setExpanded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = list.find((r) => r.personId === openId);
  // What you have in common, when they are (or were) around.
  const detail = open && encounters ? affinities(s, encounters).find((c) => c.person.personId === open.personId) : undefined;
  if (list.length === 0) return null;

  return (
    <>
      <section className="req-box" aria-label={C.title}>
        <button type="button" className="req-sum" aria-expanded={expanded} aria-controls="reqs" onClick={() => setExpanded(!expanded)}>
          <span className="stack">
            {list.slice(0, 3).map((r) => (
              <Avatar key={r.personId} id={r.personId} />
            ))}
          </span>
          <span className="req-text">
            <strong>{C.count(list.length)}</strong>
            <span>{list.map((r) => r.displayName.split(" ")[0]).join(", ")}</span>
          </span>
          <svg className="ic" aria-hidden="true">
            <use href="#i-chev" />
          </svg>
        </button>
        {expanded && (
          <ul id="reqs" className="reqs">
            {list.map((r) => (
              <li key={r.personId} className="req">
                <button type="button" className="req-who" onClick={() => setOpenId(r.personId)}>
                  <Avatar id={r.personId} />
                  <span className="req-text">
                    <strong>{r.displayName}</strong>
                    <span>{r.where}</span>
                  </span>
                </button>
                <button type="button" className="req-no" aria-label={`${C.reject}: ${r.displayName}`} onClick={() => answer(r, false)}>
                  <Icon name="x" />
                </button>
                <button type="button" className="req-yes" aria-label={`${C.accept}: ${r.displayName}`} onClick={() => answer(r, true)}>
                  <Icon name="check" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Sheet open={!!open} size="detail" onClose={() => setOpenId(null)} label={open?.displayName ?? ""}>
        {open && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Avatar id={open.personId} className="md-face" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 className="t-title">{open.displayName}</h2>
                <Mono className="mute">
                  {open.where} · {relTime(open.at)}
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
