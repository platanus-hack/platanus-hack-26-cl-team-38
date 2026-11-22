"use client";

import { Fragment, useState } from "react";
import type { PlanContent, PlanMessageView, PlanView } from "@/lib/types";
import { Avatar } from "../../_components/avatar";
import { Splash, TabBar } from "../../_components/chrome";
import { Icon } from "../../_components/icons";
import { PlanNetwork } from "../../_components/plan-network";
import { LargeTitle, Mono } from "../../_components/ui";
import { COPY } from "../../_lib/copy";
import { cap } from "../../_lib/people";
import { going } from "../../_lib/plan-network";
import { changes, threadOf, type Step, type Tally } from "../../_lib/plan-thread";
import { usePlan } from "../../_lib/plans";
import { useStickToBottom } from "../../_lib/stick-to-bottom";

// An Iniciativa on the backend: the Agentes of everyone in it, round by round, and the plan they
// reach. The phone only watches; every line here was written and filtered on the server.

const C = COPY.plan;
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
                {a.contacto && (
                  <Mono className="mute">
                    {" "}
                    {C.yourContact} {a.contacto}
                  </Mono>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

const dots = (
  <span className="typing">
    <i />
    <i />
    <i />
  </span>
);

const listed = (names: string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} ${C.and} ${names.at(-1)}`;

/** Every Agente still writing, in one row: their faces side by side and a single bubble. */
function WritingRow({ ids, me, names }: { ids: string[]; me: string; names: Map<string, string> }) {
  if (ids.length === 0) return null;
  const who = listed(ids.map((id) => (id === me ? C.you : first(names.get(id) ?? ""))));
  return (
    <div className="writing-row" role="status" aria-label={`${C.writing}: ${who}`}>
      <span className="stack">
        {ids.map((id) => (
          <Avatar key={id} id={id} />
        ))}
      </span>
      <div className="bubble">{dots}</div>
      <Mono className="mute">{who}</Mono>
    </div>
  );
}

function StepHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="plan-step">
      <Mono>{label}</Mono>
      {hint && <p>{hint}</p>}
    </div>
  );
}

function TallyLine({ tally }: { tally: Tally }) {
  if (tally.all) return <Mono className="plan-tally ok">{C.allAccept}</Mono>;
  const parts = [
    tally.accept && C.accepts(tally.accept),
    tally.adjust && C.adjusts(tally.adjust),
    tally.block && C.blocks(tally.block),
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <Mono className="plan-tally">
      {parts.join(" · ")} → {C.nextProposal}
    </Mono>
  );
}

function Decisions({ content, previous }: { content: PlanContent; previous?: PlanContent }) {
  const marks = changes(content, previous);
  if (content.decisiones.length === 0) return null;
  return (
    <dl>
      {content.decisiones.map((d, i) => (
        <div key={i}>
          <dt>
            {cap(d.tema)}
            {marks[i] && <span className="mark">{marks[i] === "nuevo" ? C.isNew : C.changed}</span>}
          </dt>
          <dd>{d.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

function Sources({ content }: { content: PlanContent }) {
  if (!content.fuentes?.length) return null;
  return (
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
  );
}

/** A proposal where the orchestrator made it: open while it is the one being answered, folded after. */
function ProposalCard({ step, open }: { step: Extract<Step, { kind: "proposal" }>; open: boolean }) {
  const { content, version } = step.proposal;
  const head = (
    <div className="ai-head">
      <Icon name="sparkle" />
      {C.orchestrator} · {C.proposal} {version}
    </div>
  );
  if (open)
    return (
      <section className="plan-card ai proposal">
        {head}
        <p className="plan-summary">{content.resumen}</p>
        <Decisions content={content} previous={step.previous} />
        <Sources content={content} />
      </section>
    );
  return (
    <details className="plan-card ai proposal old">
      <summary>
        {head}
        <p className="plan-summary">{content.resumen}</p>
        {content.decisiones.length > 0 && <Mono className="mute more">{C.seeDecisions}</Mono>}
      </summary>
      <Decisions content={content} previous={step.previous} />
    </details>
  );
}

function ThePlan({
  plan,
  names,
  verdict,
}: {
  plan: NonNullable<PlanView["plan"]>;
  names: Map<string, string>;
  verdict: string;
}) {
  const { content } = plan;
  return (
    <section className="plan-card ai">
      <div className="ai-head">
        <Icon name="sparkle" />
        {C.thePlan}
      </div>
      <div className="ai-verdict si">{verdict}</div>
      <p className="plan-summary">{content.resumen}</p>
      <Decisions content={content} />
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
      <Sources content={content} />
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

const DECISION = { accept: C.accept, adjust: C.adjust, block: C.block };

function Message({ m, me, names }: { m: PlanMessageView; me: string; names: Map<string, string> }) {
  if (m.agent !== "miembro") return <Mono className="plan-system">{m.text}</Mono>;
  const mine = m.personId === me;
  const author = first(names.get(m.personId ?? "") ?? "");
  const body = (
    <>
      <span className="who">
        {mine ? C.you : COPY.agentOf(author)}
        {m.decision && <span className={`dchip ${m.decision}`}>{DECISION[m.decision]}</span>}
        {m.participa !== undefined && (
          <span className={`pchip ${m.participa ? "va" : "nova"}`}>{m.participa ? C.going : C.notGoing}</span>
        )}
      </span>
      {m.text}
      <Aportes message={m} author={author} mine={mine} />
    </>
  );
  return mine ? (
    <div className="bubble me">{body}</div>
  ) : (
    <div className={`msg${m.participa === false ? "nova" : ""}`}>
      <Avatar id={m.personId ?? ""} />
      <div className="bubble">{body}</div>
    </div>
  );
}

export function PlanConversation({ id, me }: { id: string; me: string }) {
  const { plan, missing, confirmed } = usePlan(id);
  const closed = plan ? plan.status !== "deliberando" : false;
  const [threadEl, setThreadEl] = useState<HTMLDivElement | null>(null);
  useStickToBottom(threadEl);

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
  const thread = threadOf(plan);
  const lastProposal = thread.steps.findLastIndex((s) => s.kind === "proposal" && !s.proposal.final);

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
      <div className="thread" ref={setThreadEl}>
        {/* on a phone the network goes on top of the conversation; on a desktop it fills the panel */}
        <div className="plan-net">
          <PlanNetwork plan={plan} me={me} confirmed={confirmed} W={340} H={300} compact />
        </div>
        <Mono className={`plan-status${closed ? "done" : ""}`}>{statusOf(plan)}</Mono>
        {thread.steps.map((step, i) => (
          <Fragment key={step.kind === "opening" ? "opening" : `v${step.proposal.version}`}>
            {step.kind === "opening" ? (
              <StepHeader label={C.opening} hint={step.current ? C.openingHint : undefined} />
            ) : step.proposal.final ? (
              <StepHeader label={C.finalDecision} />
            ) : (
              <>
                <StepHeader
                  label={`${C.proposal} ${step.proposal.version}`}
                  hint={step.current ? C.answeringHint : undefined}
                />
                <ProposalCard step={step} open={!closed && i === lastProposal} />
              </>
            )}
            {step.messages.map((m) => (
              <Message key={m.id} m={m} me={me} names={names} />
            ))}
            {step.current && <WritingRow ids={thread.writers} me={me} names={names} />}
            {step.kind === "proposal" && step.tally && <TallyLine tally={step.tally} />}
          </Fragment>
        ))}
        {thread.drafting && (
          <>
            <StepHeader
              label={thread.drafting.final ? C.finalDecision : `${C.proposal} ${thread.drafting.version}`}
              hint={thread.drafting.final ? C.draftingFinal : `${C.drafting} ${thread.drafting.version}`}
            />
            <div className="plan-drafting" role="status" aria-label={`${C.orchestrator}: ${C.writing}`}>
              <Icon name="sparkle" />
              {dots}
            </div>
          </>
        )}
        {closed && plan.plan && <ThePlan plan={plan.plan} names={names} verdict={statusOf(plan)} />}
        <Confirmations plan={plan} confirmed={confirmed} />
      </div>
      <TabBar />
    </div>
  );
}
