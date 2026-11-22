"use client";

import { useEffect, useRef } from "react";
import type { PlanMessageView, PlanView } from "@/lib/types";
import { Avatar } from "../../_components/avatar";
import { Splash, TabBar } from "../../_components/chrome";
import { Icon } from "../../_components/icons";
import { PlanNetwork } from "../../_components/plan-network";
import { LargeTitle, Mono } from "../../_components/ui";
import { COPY } from "../../_lib/copy";
import { cap } from "../../_lib/people";
import { going } from "../../_lib/plan-network";
import { usePlan } from "../../_lib/plans";
import { writing } from "@/lib/plans/writing";

// An Iniciativa on the backend: the Agentes of everyone in it, round by round, and the plan they
// reach. The phone only watches; every line here was written and filtered on the server.

const C = COPY.plan;
const time = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit" });
const first = (name: string) => name.split(" ")[0];
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function statusOf(plan: PlanView): string {
  if (plan.status === "consenso") return C.consensus;
  if (plan.status === "decidido") return plan.plan?.decidedBy === "codigo" ? C.closedByCode : C.decided;
  return `${plan.round === 0 ? C.opening : `Ronda ${plan.round} de ${plan.maxRounds}`} · ${C.deliberating}`;
}

function Aportes({ message, author, mine }: { message: PlanMessageView; author: string; mine: boolean }) {
  const own = message.aportes.filter((a) => a.origen === "propio");
  const network = message.aportes.filter((a) => a.origen === "red");
  if (own.length === 0 && network.length === 0) return null;
  return (
    <div className="aportes">
      {own.length > 0 && (
        <ul>
          {own.map((a, i) => (
            <li key={i}>{a.texto}</li>
          ))}
        </ul>
      )}
      {network.length > 0 && (
        <details>
          <summary>
            <Mono>
              {mine ? C.yourNetwork : `${C.networkOf} ${author}`} · {network.length}
            </Mono>
          </summary>
          <ul>
            {network.map((a, i) => (
              <li key={i}>
                {a.texto}
                {a.contacto && <Mono className="mute"> {C.yourContact} {a.contacto}</Mono>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

const dots = (
  <span className="typing" role="status" aria-label={C.writing}>
    <i />
    <i />
    <i />
  </span>
);

function Writing({ plan, me }: { plan: PlanView; me: string }) {
  const { members, orchestrator } = writing(plan);
  return (
    <>
      {members.map((id) =>
        id === me ? (
          <div key={id} className="bubble me">
            {dots}
          </div>
        ) : (
          <div key={id} className="msg">
            <Avatar id={id} />
            <div className="bubble">{dots}</div>
          </div>
        ),
      )}
      {orchestrator && (
        <div className="plan-note">
          <Mono className="mute">{C.orchestrator}</Mono>
          {dots}
        </div>
      )}
    </>
  );
}

function ThePlan({ plan, names, verdict }: { plan: NonNullable<PlanView["plan"]>; names: Map<string, string>; verdict?: string }) {
  const { content } = plan;
  return (
    <section className="plan-card ai">
      <div className="ai-head">
        <Icon name="sparkle" />
        {plan.decidedBy ? C.thePlan : C.proposal}
      </div>
      {verdict && <div className="ai-verdict si">{verdict}</div>}
      <p className="plan-summary">{content.resumen}</p>
      {content.decisiones.length > 0 && (
        <dl>
          {content.decisiones.map((d, i) => (
            <div key={i}>
              <dt>{cap(d.tema)}</dt>
              <dd>{d.valor}</dd>
            </div>
          ))}
        </dl>
      )}
      {content.desacuerdos.length > 0 && (
        <>
          <div className="sec">{C.disagreements}</div>
          <ul>
            {content.desacuerdos.map((d, i) => (
              <li key={i}>
                <Mono className="mute">{first(names.get(d.personId) ?? "")}</Mono> {cap(d.tema)}: {d.detalle}
              </li>
            ))}
          </ul>
        </>
      )}
      {content.fuentes && content.fuentes.length > 0 && (
        <>
          <div className="sec">{C.sources}</div>
          <ul className="plan-sources">
            {content.fuentes.map((f, i) => (
              <li key={i}>
                {f.dato}{" "}
                <a href={f.url} target="_blank" rel="noopener noreferrer">
                  <Mono>{hostOf(f.url)}</Mono>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Whoever is in the plan confirming it, one after the other (see usePlan: shown, not saved). */
function Confirmations({ plan, confirmed }: { plan: PlanView; confirmed: string[] }) {
  const expected = going(plan);
  if (confirmed.length === 0) return null;
  return (
    <section className="plan-confirm">
      <div className="sec">
        {C.confirmations}
        <Mono className={confirmed.length === expected.length ? "all" : "mute"}>
          {confirmed.length}/{expected.length}
        </Mono>
      </div>
      <div className="rows">
        {plan.members
          .filter((m) => confirmed.includes(m.personId))
          .map((m) => (
            <div key={m.personId} className="row">
              <span className="lead">
                <Avatar id={m.personId} />
              </span>
              <span className="main">
                <span className="title">{m.displayName}</span>
              </span>
              <Mono className="ok">{C.confirmed}</Mono>
            </div>
          ))}
      </div>
    </section>
  );
}

export function PlanConversation({ id, me }: { id: string; me: string }) {
  const { plan, missing, confirmed } = usePlan(id);
  const end = useRef<HTMLDivElement>(null);
  const seen = plan?.messages.length ?? 0;
  const closed = plan ? plan.status !== "deliberando" : false;
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [seen, closed, confirmed.length]);

  if (missing)
    return (
      <div className="app with-tabs">
        <LargeTitle title={COPY.conversaciones.title} back="/conversaciones" />
        <p className="mute content">{COPY.conversaciones.notFound}</p>
        <TabBar />
      </div>
    );
  if (!plan) return <Splash />;

  const names = new Map(plan.members.map((m) => [m.personId, m.displayName]));
  const others = plan.members.filter((m) => m.personId !== me);
  const decision = { accept: C.accept, adjust: C.adjust, block: C.block };

  return (
    <div className="app with-tabs">
      <LargeTitle
        title={cap(plan.intent.length > 48 ? `${plan.intent.slice(0, 47)}…` : plan.intent)}
        back="/conversaciones"
        sub={
          <Mono className="mute">
            {C.label} · {COPY.agents(plan.members.length)} · {others.map((m) => first(m.displayName)).join(", ")}
          </Mono>
        }
      />
      <div className="thread">
        {/* on a phone the network goes on top of the conversation; on a desktop it fills the panel */}
        <div className="plan-net">
          <PlanNetwork plan={plan} me={me} confirmed={confirmed} W={340} H={300} compact />
        </div>
        <Mono className={`plan-status${closed ? " done" : ""}`}>{statusOf(plan)}</Mono>
        {plan.messages.map((m) => {
          if (m.agent !== "miembro")
            return (
              <div key={m.id} className="plan-note">
                <Mono className="mute">{m.agent === "orquestador" ? C.orchestrator : time.format(new Date(m.createdAt))}</Mono>
                {m.text}
              </div>
            );
          const mine = m.personId === me;
          const author = first(names.get(m.personId ?? "") ?? "");
          const body = (
            <>
              <span className="who">
                {mine ? C.you : COPY.agentOf(author)}
                {m.decision && ` · ${decision[m.decision]}`}
                {m.participa !== undefined && <span className={`pchip ${m.participa ? "va" : "nova"}`}>{m.participa ? C.going : C.notGoing}</span>}
              </span>
              {m.text}
              <Aportes message={m} author={author} mine={mine} />
            </>
          );
          return mine ? (
            <div key={m.id} className="bubble me">
              {body}
            </div>
          ) : (
            <div key={m.id} className={`msg${m.participa === false ? " nova" : ""}`}>
              <Avatar id={m.personId ?? ""} />
              <div className="bubble">{body}</div>
            </div>
          );
        })}
        <Writing plan={plan} me={me} />
        {plan.plan && <ThePlan plan={plan.plan} names={names} verdict={closed ? statusOf(plan) : undefined} />}
        <Confirmations plan={plan} confirmed={confirmed} />
        <div ref={end} />
      </div>
      <TabBar />
    </div>
  );
}
