import type { PlanContent, PlanMessageView, PlanView } from "@/lib/types";
import { writing } from "@/lib/plans/writing";

// The conversation of a plan cut into the steps the code runs: the opening, where every Agente
// says what its person needs, then one step per proposal of the orchestrator with the answers to
// it, and what each step came to. Pure, so the order on screen is the order on the server.

type Proposal = NonNullable<PlanMessageView["proposal"]>;

export type Tally = { accept: number; adjust: number; block: number; all: boolean };

export type Step =
  | { kind: "opening"; messages: PlanMessageView[]; current: boolean }
  | {
      kind: "proposal";
      proposal: Proposal;
      /** The proposal before this one, to tell what changed. */
      previous?: PlanContent;
      messages: PlanMessageView[];
      current: boolean;
      /** Once every Agente answered, or the plan moved on. */
      tally?: Tally;
    };

export type Thread = {
  steps: Step[];
  /** Agentes writing right now, and whether the orchestrator is drafting the next proposal. */
  writers: string[];
  drafting: { version: number; final: boolean } | null;
};

function tally(messages: PlanMessageView[]): Tally {
  const decisions = messages.flatMap((m) => (m.decision ? [m.decision] : []));
  const count = (d: string) => decisions.filter((x) => x === d).length;
  return { accept: count("accept"), adjust: count("adjust"), block: count("block"), all: decisions.length > 0 && decisions.every((d) => d === "accept") };
}

export function threadOf(plan: PlanView): Thread {
  const steps: Step[] = [{ kind: "opening", messages: [], current: false }];
  for (const m of plan.messages) {
    if (m.agent === "orquestador" && m.proposal) {
      const previous = steps.findLast((s) => s.kind === "proposal");
      steps.push({ kind: "proposal", proposal: m.proposal, previous: previous?.kind === "proposal" ? previous.proposal.content : undefined, messages: [], current: false });
    } else steps.at(-1)!.messages.push(m);
  }

  const open = plan.status === "deliberando";
  const { members: writers, orchestrator } = writing(plan);
  steps.forEach((step, i) => {
    const last = i === steps.length - 1;
    step.current = open && last && !orchestrator;
    if (step.kind === "proposal" && !step.proposal.final && (!last || !open || orchestrator)) step.tally = tally(step.messages);
  });

  const lastVersion = steps.findLast((s) => s.kind === "proposal")?.proposal.version ?? 0;
  return {
    steps,
    writers,
    drafting: open && orchestrator ? { version: lastVersion + 1, final: lastVersion >= plan.maxRounds } : null,
  };
}

const norm = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();

/** For each decision of a proposal: new, changed since the previous one, or the same. */
export function changes(content: PlanContent, previous?: PlanContent): ("nuevo" | "cambio" | null)[] {
  if (!previous) return content.decisiones.map(() => null);
  const before = new Map(previous.decisiones.map((d) => [norm(d.tema), norm(d.valor)]));
  return content.decisiones.map((d) => {
    const was = before.get(norm(d.tema));
    return was === undefined ? "nuevo" : was === norm(d.valor) ? null : "cambio";
  });
}
