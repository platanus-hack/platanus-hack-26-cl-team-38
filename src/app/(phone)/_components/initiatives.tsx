"use client";

import { type ReactNode, useState } from "react";
import type { PlanSummary } from "@/lib/types";
import { Avatar } from "./avatar";
import { ListRow } from "./ui";
import { buildInitiative, type Conversation, localInitiatives } from "../_lib/conversations";
import { COPY } from "../_lib/copy";
import { affinities, cap, DEMO, type Encounter, relTime } from "../_lib/people";
import { usePlans } from "../_lib/plans";
import type { PhoneState } from "../_lib/store";

// Your Iniciativas, newest first and a page at a time: the same list in Inicio and in Chats.
// With a backend they are plans; demo mode keeps them on the phone.

const PAGE = 5;

function Row({ cv, replies }: { cv: Conversation; replies?: { text: string }[] }) {
  // The most useful line: what you or your Agente said last.
  const last = (replies?.length ? replies[replies.length - 1] : cv.messages[cv.messages.length - 1])?.text ?? "";
  return (
    <ListRow
      lead={
        <span className="stack">
          {cv.members.slice(0, 3).map((m) => (
            <Avatar key={m.person.personId} id={m.person.personId} />
          ))}
        </span>
      }
      title={
        <>
          <span className="theme">{COPY.plan.label}</span> {cv.theme}
        </>
      }
      sub={`${cv.members.map((m) => m.person.displayName.split(" ")[0]).join(", ")} · ${last}`}
      data={relTime(cv.at).replace("hace ", "")}
      href={`/conversaciones/${encodeURIComponent(cv.id)}`}
    />
  );
}

function PlanRow({ plan, me }: { plan: PlanSummary; me: string }) {
  const others = plan.members.filter((m) => m.personId !== me);
  const state =
    plan.status === "deliberando"
      ? `${COPY.plan.deliberating} · ${plan.round} de ${plan.maxRounds}`
      : (plan.resumen ?? (plan.status === "consenso" ? COPY.plan.consensus : COPY.plan.decided));
  return (
    <ListRow
      lead={
        <span className="stack">
          {others.slice(0, 3).map((m) => (
            <Avatar key={m.personId} id={m.personId} />
          ))}
        </span>
      }
      title={
        <>
          <span className="theme">{COPY.plan.label}</span> {cap(plan.intent)}
        </>
      }
      sub={`${others.map((m) => m.displayName.split(" ")[0]).join(", ")} · ${state}`}
      data={relTime(plan.updatedAt).replace("hace ", "")}
      href={`/conversaciones/${encodeURIComponent(plan.id)}`}
    />
  );
}

/** `head` goes above the list when there is one; `empty` shows once we know there is none. With `max`, only the newest ones and no more pages. */
export function Initiatives({
  s,
  encounters,
  max,
  head,
  empty,
}: {
  s: PhoneState;
  encounters: Encounter[] | undefined;
  max?: number;
  head: ReactNode;
  empty?: ReactNode;
}) {
  const plans = usePlans();
  const [shown, setShown] = useState(max ?? PAGE);
  const people = encounters ? affinities(s, encounters) : [];
  const mine =
    DEMO && encounters ? localInitiatives(s, encounters).map((i) => buildInitiative(s.displayName, i, people)) : [];
  const rows = [
    ...plans.map((plan) => <PlanRow key={plan.id} plan={plan} me={s.personId} />),
    ...mine.map((cv) => <Row key={cv.id} cv={cv} replies={s.replies?.[cv.id]} />),
  ];
  if (rows.length === 0) return encounters !== undefined ? (empty ?? null) : null;
  return (
    <>
      {head}
      <div className="rows">{rows.slice(0, shown)}</div>
      {!max && rows.length > shown && (
        <button type="button" className="more-btn" onClick={() => setShown(shown + PAGE)}>
          {COPY.more} ({rows.length - shown})
        </button>
      )}
    </>
  );
}
