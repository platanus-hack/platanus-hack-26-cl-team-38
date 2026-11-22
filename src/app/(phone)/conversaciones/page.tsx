"use client";

import Link from "next/link";
import { Avatar } from "../_components/avatar";
import { Splash, TabBar, useOnboardedPhone } from "../_components/chrome";
import { Requests } from "../_components/requests";
import { LargeTitle, ListRow } from "../_components/ui";
import { allConversations, buildInitiative, type Conversation } from "../_lib/conversations";
import { COPY } from "../_lib/copy";
import { affinities, byTopic, cap, coincidences, DEMO, RANGE, relTime, useEncounters } from "../_lib/people";
import { usePlans } from "../_lib/plans";
import type { PlanSummary } from "@/lib/types";

const C = COPY.conversaciones;

function Row({ cv, replies }: { cv: Conversation; replies?: { text: string }[] }) {
  // The most useful line: what you or your Agente said last, else (one to one) what they found in
  // common, not the closing "De acuerdo".
  const last = replies?.length ? replies[replies.length - 1].text : (cv.kind === "persona" ? cv.messages[cv.messages.length - 3] : cv.messages[cv.messages.length - 1])?.text ?? "";
  const when = relTime(cv.at).replace("hace ", "");
  const href = `/conversaciones/${encodeURIComponent(cv.id)}`;
  if (cv.kind === "grupo")
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
            <span className="theme">{cv.label ?? "Temática"}</span> {cv.theme}
          </>
        }
        sub={`${cv.members.map((m) => m.person.displayName).join(", ")} · ${last}`}
        data={when}
        href={href}
      />
    );
  const p = cv.members[0];
  return <ListRow lead={<Avatar id={p.person.personId} />} title={p.person.displayName} sub={last} data={when} href={href} />;
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

  // The log keeps every Conversación, whatever Distancia you have set today.
  const coins = encounters && DEMO ? coincidences({ ...s, radiusM: RANGE.max }, encounters) : [];
  const contacts = encounters ? affinities(s, encounters) : [];
  const mine = DEMO ? (s.initiatives ?? []).map((i) => buildInitiative(s.displayName, i, contacts)) : [];
  const all = [...mine, ...allConversations(s.displayName, coins, byTopic(coins))];
  const grupos = all.filter((c) => c.kind === "grupo");
  const personas = all.filter((c) => c.kind === "persona").sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="app with-tabs">
      <LargeTitle title={C.title} />
      <div className="content">
        <Requests s={s} encounters={encounters} />
        {encounters !== undefined && all.length === 0 && plans.length === 0 ? (
          <div className="empty-state">
            <p className="mute">{DEMO ? C.empty : C.noBackend}</p>
            <p className="mute">{C.startOne}</p>
            <Link href="/" className="btn">
              {C.startCta}
            </Link>
          </div>
        ) : (
          <>
            {grupos.length + plans.length > 0 && (
              <>
                <div className="sec u" style={{ marginTop: 8 }}>
                  {C.groups}
                </div>
                <div className="rows">
                  {plans.map((plan) => (
                    <PlanRow key={plan.id} plan={plan} me={s.personId} />
                  ))}
                  {grupos.map((cv) => (
                    <Row key={cv.id} cv={cv} replies={s.replies?.[cv.id]} />
                  ))}
                </div>
              </>
            )}
            <div className="sec u">{C.people}</div>
            <div className="rows">
              {personas.map((cv) => (
                <Row key={cv.id} cv={cv} replies={s.replies?.[cv.id]} />
              ))}
            </div>
          </>
        )}
      </div>
      <TabBar />
    </div>
  );
}
