import type { PlanMessageView, PlanView } from "@/lib/types";

// A plan as the phone shows it: its messages revealed one at a time, whoever is in it confirming
// on their own once it closes, and the network around it (who was asked, who answered, which of
// their contacts a piece of the plan came from). All pure, so the phone and the desktop panel
// draw the same thing from the same numbers.

/** Contacts drawn around each participant; the rest are a "+n". */
export const MAX_DOTS = 7;

type Opening = PlanMessageView & { agent: "miembro" };

const openingOf = (plan: PlanView, personId: string) => plan.messages.find((m): m is Opening => m.agent === "miembro" && m.round === 0 && m.personId === personId);

/** Who confirms the plan once it closes: everyone whose Agente did not say they cannot be part of it. */
export function going(plan: PlanView): string[] {
  return plan.members.filter((m) => openingOf(plan, m.personId)?.participa !== false).map((m) => m.personId);
}

/**
 * The plan with only its first `shown` messages. Until the last one is out it still reads as
 * deliberating, and the plan in force is the last proposal already shown, not the newest stored.
 */
export function paced(raw: PlanView, shown: number): PlanView {
  if (shown >= raw.messages.length) return raw;
  const messages = raw.messages.slice(0, shown);
  const proposal = messages.findLast((m) => m.proposal)?.proposal;
  const round = messages.reduce((max, m) => Math.max(max, m.round), 0);
  return { ...raw, status: "deliberando", round, messages, plan: proposal ? { version: proposal.version, content: proposal.content, decidedBy: null } : null };
}

export type NetStatus = "esperando" | "va" | "no_va";
export type NetMember = {
  personId: string;
  name: string;
  owner: boolean;
  me: boolean;
  status: NetStatus;
  /** The latest answer to a proposal, if any. */
  decision?: "accept" | "adjust" | "block";
  /** Contacts outside the plan this person's Agente can read. */
  contacts: number;
  /** How many of them are drawn. */
  dots: number;
  /** Which drawn contacts something in the plan came from (0-based). */
  lit: number[];
  confirmed: boolean;
};
export type Network = {
  members: NetMember[];
  /** While the Agentes read their networks: nobody has answered a proposal yet. */
  consulting: boolean;
  answered: number;
  fromNetwork: number;
  confirmed: number;
};

const first = (name: string) => name.split(" ")[0];

export function networkOf(plan: PlanView, me: string, confirmed: string[] = []): Network {
  const done = new Set(confirmed);
  const members = plan.members.map((m): NetMember => {
    const opening = openingOf(plan, m.personId);
    const mine = plan.messages.filter((x) => x.agent === "miembro" && x.personId === m.personId);
    const dots = Math.min(m.contacts, MAX_DOTS);
    const sources = new Set(mine.flatMap((x) => x.aportes.flatMap((a) => (a.origen === "red" && a.fuente ? [a.fuente] : []))));
    return {
      personId: m.personId,
      name: first(m.displayName),
      owner: m.personId === plan.ownerId,
      me: m.personId === me,
      status: !opening ? "esperando" : opening.participa === false ? "no_va" : "va",
      decision: mine.findLast((x) => x.decision)?.decision,
      contacts: m.contacts,
      dots,
      // A quoted contact beyond the ones drawn still lights one of them.
      lit: dots ? [...new Set([...sources].map((n) => (n - 1) % dots))].sort((a, b) => a - b) : [],
      confirmed: done.has(m.personId),
    };
  });
  return {
    members,
    consulting: plan.status === "deliberando" && members.some((m) => m.status === "esperando"),
    answered: members.filter((m) => m.status !== "esperando").length,
    fromNetwork: plan.messages.reduce((n, m) => n + m.aportes.filter((a) => a.origen === "red").length, 0),
    confirmed: members.filter((m) => m.confirmed).length,
  };
}

export type Point = { x: number; y: number };
export type Placed = { at: Point; dots: Point[] };

/**
 * Where everyone goes: the owner in the middle, the rest on a ring around, and each one's contacts
 * fanned outward behind them (the owner's, close around the middle).
 */
export function layout(members: Pick<NetMember, "personId" | "owner" | "dots">[], W: number, H: number): Record<string, Placed> {
  const c = { x: W / 2, y: H / 2 };
  const on = (deg: number, rx: number, ry: number): Point => ({ x: c.x + Math.cos((deg * Math.PI) / 180) * rx, y: c.y + Math.sin((deg * Math.PI) / 180) * ry });
  const others = members.filter((m) => !m.owner);
  const step = 360 / Math.max(others.length, 1);
  const out: Record<string, Placed> = {};
  for (const m of members) {
    if (m.owner) {
      out[m.personId] = { at: c, dots: Array.from({ length: m.dots }, (_, i) => on(-90 + step / 2 + (i * 360) / m.dots, W * 0.105, H * 0.095)) };
      continue;
    }
    const deg = -90 + others.indexOf(m) * step;
    // The fan never invades the next person's: at most 70% of the slice, 13° between contacts.
    const span = Math.min(step * 0.7, 13 * Math.max(m.dots - 1, 0));
    out[m.personId] = {
      at: on(deg, W * 0.25, H * 0.22),
      dots: Array.from({ length: m.dots }, (_, i) => on(deg + (m.dots > 1 ? -span / 2 + (span * i) / (m.dots - 1) : 0), W * 0.43, H * 0.4)),
    };
  }
  return out;
}
