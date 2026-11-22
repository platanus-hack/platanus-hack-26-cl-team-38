"use client";

import Link from "next/link";
import { Avatar } from "../_components/avatar";
import { Splash, TabBar, useOnboardedPhone } from "../_components/chrome";
import { Requests } from "../_components/requests";
import { LargeTitle, ListRow } from "../_components/ui";
import { buildInitiative, type Conversation, localInitiatives } from "../_lib/conversations";
import { COPY } from "../_lib/copy";
import { affinities, cap, DEMO, relTime, useEncounters } from "../_lib/people";
import { usePlans } from "../_lib/plans";
import type { PlanSummary } from "@/lib/types";

const C = COPY.conversaciones;

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
    plan.status === "deliberando" ? `${COPY.plan.deliberating} · ${plan.round} de ${plan.maxRounds}` : (plan.resumen ?? (plan.status === "consenso" ? COPY.plan.consensus : COPY.plan.decided));
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

export default function ConversacionesPage() {
  const s = useOnboardedPhone();
  const encounters = useEncounters();
  const plans = usePlans();
  if (!s) return <Splash />;

  // Demo mode keeps your Iniciativas on the phone; with a backend they are plans.
  const contacts = encounters ? affinities(s, encounters) : [];
  const mine = DEMO && encounters ? localInitiatives(s, encounters).map((i) => buildInitiative(s.displayName, i, contacts)) : [];

  return (
    <div className="app with-tabs">
      <LargeTitle title={C.title} />
      <div className="content">
        <Requests s={s} encounters={encounters} />
        {encounters !== undefined && mine.length + plans.length === 0 ? (
          <div className="empty-state">
            <p className="mute">{C.empty}</p>
            <p className="mute">{C.startOne}</p>
            <Link href="/" className="btn">
              {C.startCta}
            </Link>
          </div>
        ) : (
          mine.length + plans.length > 0 && (
            <>
              <div className="sec u" style={{ marginTop: 8 }}>
                {C.initiatives}
              </div>
              <div className="rows">
                {plans.map((plan) => (
                  <PlanRow key={plan.id} plan={plan} me={s.personId} />
                ))}
                {mine.map((cv) => (
                  <Row key={cv.id} cv={cv} replies={s.replies?.[cv.id]} />
                ))}
              </div>
            </>
          )
        )}
      </div>
      <TabBar />
    </div>
  );
}
