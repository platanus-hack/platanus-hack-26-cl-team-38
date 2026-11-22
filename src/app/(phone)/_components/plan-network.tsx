"use client";

import { useEffect, useRef, useState } from "react";
import type { PlanView } from "@/lib/types";
import { avatarSvg } from "./avatar";
import { COPY } from "../_lib/copy";
import { layout, type NetMember, networkOf, type Point } from "../_lib/plan-network";
import { usePlan } from "../_lib/plans";

// The network of a plan, on slate: who made it in the middle, who is in it around, and behind each
// one the contacts their Agente can read (dots, never names). A dot runs along a line every time
// an Agente asks or answers, and a contact lights up when something in the plan came from them.

const C = COPY.plan.network;

type Run = { key: string; path: Point[]; delay: number; dur: number };

/** One dot that runs a path once. */
function Runner({ run, onDone }: { run: Run; onDone: (key: string) => void }) {
  const motion = useRef<SVGAnimateMotionElement>(null);
  useEffect(() => {
    const start = setTimeout(() => motion.current?.beginElement(), run.delay);
    const end = setTimeout(() => onDone(run.key), run.delay + run.dur + 80);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
    };
    // A run never changes once it is on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const d = run.path.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return (
    <circle r={4.5} className="run">
      <animateMotion ref={motion} dur={`${run.dur}ms`} begin="indefinite" fill="freeze" path={d} />
    </circle>
  );
}

function chipOf(m: NetMember, consulting: boolean, closed: boolean): { text: string; cls: string } | null {
  if (m.confirmed) return { text: C.confirmed, cls: "ok" };
  if (m.status === "no_va") return { text: C.notGoing, cls: "no" };
  if (m.status === "esperando") return consulting ? { text: C.asking, cls: "wait" } : null;
  if (!closed && m.decision === "adjust") return { text: C.adjust, cls: "warn" };
  if (!closed && m.decision === "block") return { text: C.block, cls: "warn" };
  return { text: C.going, cls: "ok" };
}

/** `compact`: the small one on top of the conversation, on a phone. */
export function PlanNetwork({ plan, me, confirmed, W, H, compact = false }: { plan: PlanView; me: string; confirmed: string[]; W: number; H: number; compact?: boolean }) {
  const k = compact ? 0.62 : 1;
  const net = networkOf(plan, me, confirmed);
  const at = layout(net.members, W, H);
  const owner = net.members.find((m) => m.owner);
  const closed = plan.status !== "deliberando";

  // A dot for every message that comes out while you watch: from the contact it came from to their
  // person and on to the middle, or from the middle to everyone when there is a new proposal.
  const [runs, setRuns] = useState<Run[]>([]);
  const seen = useRef<Set<number> | null>(null);
  const key = plan.messages.map((m) => m.id).join(",");
  useEffect(() => {
    const fresh = plan.messages.filter((m) => seen.current !== null && !seen.current.has(m.id));
    seen.current = new Set(plan.messages.map((m) => m.id));
    if (!owner || fresh.length === 0) return;
    const center = at[owner.personId].at;
    const next: Run[] = [];
    for (const m of fresh) {
      if (m.agent === "orquestador") {
        for (const other of net.members.filter((x) => !x.owner)) next.push({ key: `${m.id}>${other.personId}`, path: [center, at[other.personId].at], delay: 0, dur: 600 });
        continue;
      }
      const who = net.members.find((x) => x.personId === m.personId);
      if (m.agent !== "miembro" || !who) continue;
      const here = at[who.personId];
      const sources = [...new Set(m.aportes.flatMap((a) => (a.origen === "red" && a.fuente && who.dots ? [(a.fuente - 1) % who.dots] : [])))];
      sources.forEach((dot, i) => next.push({ key: `${m.id}<${dot}`, path: [here.dots[dot], here.at, ...(who.owner ? [] : [center])], delay: i * 160, dur: who.owner ? 450 : 900 }));
      if (sources.length === 0 && !who.owner) next.push({ key: `${m.id}<`, path: [here.at, center], delay: 0, dur: 550 });
    }
    setRuns((r) => [...r, ...next]);
    // Positions depend only on who is in the plan: the message list is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const done = (k: string) => setRuns((r) => r.filter((x) => x.key !== k));

  const status = closed
    ? `${C.closed} · ${net.confirmed} ${net.confirmed === 1 ? C.oneConfirmed : C.manyConfirmed}`
    : net.consulting
      ? `${C.consulting} · ${net.answered} ${C.of} ${net.members.length}`
      : `${C.round} ${plan.round} ${C.of} ${plan.maxRounds}${net.fromNetwork ? ` · ${net.fromNetwork} ${net.fromNetwork === 1 ? C.oneFromNetwork : C.manyFromNetwork}` : ""}`;

  return (
    <div className={`pnet${compact ? " compact" : ""}`}>
      <div className="pnet-graph">
      <div className="gbox" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${C.label}: ${status}`}>
          {/* each person's contacts, and the line to them */}
          {net.members.map((m) =>
            at[m.personId].dots.map((dot, i) => {
              const lit = m.lit.includes(i);
              const asking = net.consulting && m.status === "esperando";
              const from = at[m.personId].at;
              return (
                <g key={`${m.personId}:${i}`} className={`contact${lit ? " lit" : ""}`}>
                  <line x1={from.x} y1={from.y} x2={dot.x} y2={dot.y} />
                  {asking && (
                    <circle r={2.5} className="ask">
                      <animateMotion dur="1.5s" begin={`${(i * 0.23) % 1.5}s`} repeatCount="indefinite" path={`M${from.x.toFixed(1)} ${from.y.toFixed(1)} L${dot.x.toFixed(1)} ${dot.y.toFixed(1)}`} />
                    </circle>
                  )}
                  {lit && <circle cx={dot.x} cy={dot.y} r={13 * k} className="glow" />}
                  <circle cx={dot.x} cy={dot.y} r={(lit ? 7 : 5) * k} className="dot" />
                </g>
              );
            }),
          )}
          {/* the plan itself: its owner with everyone in it */}
          {owner &&
            net.members
              .filter((m) => !m.owner)
              .map((m) => <line key={m.personId} className={`edge${m.status === "va" ? " strong" : ""}`} x1={at[owner.personId].at.x} y1={at[owner.personId].at.y} x2={at[m.personId].at.x} y2={at[m.personId].at.y} strokeWidth={1.5} />)}
          {runs.map((run) => (
            <Runner key={run.key} run={run} onDone={done} />
          ))}
          {net.members.map((m) => {
            const p = at[m.personId].at;
            const r = (m.owner ? 27 : 23) * k;
            const chip = chipOf(m, net.consulting, closed);
            // Half the width of the chip: mono text, so it is the length that counts.
            const half = (chip ? chip.text.length * (compact ? 2.8 : 3.4) : 0) + (compact ? 6 : 9);
            const tall = compact ? 14 : 18;
            const more = m.contacts - m.dots;
            return (
              <g key={m.personId} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`} className={`who ${m.status}${m.confirmed ? " confirmed" : ""}`}>
                <circle r={r} className="disc" />
                <svg x={-r + 3} y={-r + 3} width={(r - 3) * 2} height={(r - 3) * 2} viewBox="0 0 40 40" dangerouslySetInnerHTML={{ __html: avatarSvg(m.personId) }} />
                <circle r={r} fill="none" className="halo" strokeWidth={3} />
                <text y={r + (compact ? 12 : 17)} className="lbl">
                  {m.me ? C.you : m.name}
                  {more > 0 && <tspan className="more"> +{more}</tspan>}
                </text>
                {chip && (
                  <g className={`chip ${chip.cls}`} transform={`translate(0 ${r + (compact ? 24 : 33)})`}>
                    <rect x={-half} y={-tall / 2} width={half * 2} height={tall} rx={tall / 2} />
                    <text y={0.5}>{chip.text}</text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      </div>
      <p className="pnet-status" role="status">
        {status}
      </p>
    </div>
  );
}

/** The desktop panel while a plan is open: the same network, big. */
export function PlanStage({ id, me }: { id: string; me: string }) {
  const { plan, confirmed } = usePlan(id);
  return (
    <section className="stage" aria-label={C.label}>
      {plan && <PlanNetwork plan={plan} me={me} confirmed={confirmed} W={640} H={700} />}
      <PlanLegend />
    </section>
  );
}

/** How to read the network, under it on the desktop panel. */
export function PlanLegend() {
  return (
    <ul className="pnet-legend">
      <li>
        <i className="dot cercania" />
        {C.going}
      </li>
      <li>
        <i className="dot nova" />
        {C.notGoing}
      </li>
      <li>
        <i className="dot amigo" />
        {C.legendSource}
      </li>
      <li>
        <i className="dot contact" />
        {C.legendDots}
      </li>
    </ul>
  );
}
