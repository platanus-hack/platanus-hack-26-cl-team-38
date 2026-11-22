import type { Db } from "@/lib/users/profile";
import { neighbourhood, networkContext, ownContext, type Contact, type PlanMember, type PlanSnapshot } from "./store";

// What one participant's agent reads: its owner's own lines, and those of the owner's connections
// outside the plan (the neighbourhood). The agent of A reading the lines of D and E is A': there
// is no separate agent for the network.

// Lines of the neighbourhood an agent gets per turn. Past this, the lines are chosen by embedding
// against what the plan still has open.
export const NETWORK_BUDGET = 150;

export type AgentLine = {
  // What the agent cites: P# for its owner's lines, R# for the network's.
  ref: string;
  lineId: string;
  section: string;
  text: string;
  origen: "propio" | "red";
  // The agent sees contacts by number, never by name, so it cannot write the name down.
  contact?: { id: string; number: number };
};

export type AgentContext = {
  lines: AgentLine[];
  // For this agent only: the plan's restrictions and the owner's standing ones. Never citable.
  privateNotes: string[];
  contactNames: string[];
};

export type ContextDeps = { db: Db; embed: (texts: string[]) => Promise<number[][]> };

export function createContextBuilder(plan: Pick<PlanSnapshot, "id" | "intent">, deps: ContextDeps) {
  const own = new Map<string, ReturnType<typeof ownContext>>();
  const contacts = new Map<string, Promise<Contact[]>>();
  // A neighbourhood that fits whole is read once: it does not depend on what is open.
  const whole = new Map<string, Awaited<ReturnType<typeof networkContext>>>();

  async function networkLines(member: PlanMember, around: string[], needs: string[]) {
    const known = whole.get(member.personId);
    if (known) return known;
    const all = await networkContext(deps.db, around, null, NETWORK_BUDGET + 1);
    if (all.length <= NETWORK_BUDGET) {
      whole.set(member.personId, all);
      return all;
    }
    // Single words match anything with this model: only the intent and full sentences are queries.
    const queries = await deps.embed([plan.intent, ...needs]);
    return networkContext(deps.db, around, queries, NETWORK_BUDGET);
  }

  return async function build(member: PlanMember, needs: string[]): Promise<AgentContext> {
    if (!own.has(member.personId)) own.set(member.personId, ownContext(deps.db, member.personId));
    if (!contacts.has(member.personId)) contacts.set(member.personId, neighbourhood(deps.db, plan.id, member.personId));
    const [mine, around] = await Promise.all([own.get(member.personId)!, contacts.get(member.personId)!]);

    const numberOf = new Map(around.map((c, i) => [c.contactId, i + 1]));
    const network = (await networkLines(member, around.map((c) => c.contactId), needs))
      .slice()
      .sort((a, b) => numberOf.get(a.userId)! - numberOf.get(b.userId)! || a.lineId.localeCompare(b.lineId));

    const shared = mine.filter((line) => line.scope === "red");
    return {
      lines: [
        ...shared.map((line, i): AgentLine => ({ ref: `P${i + 1}`, lineId: line.lineId, section: line.section, text: line.text, origen: "propio" })),
        ...network.map((line, i): AgentLine => ({
          ref: `R${i + 1}`,
          lineId: line.lineId,
          section: line.section,
          text: line.text,
          origen: "red",
          contact: { id: line.userId, number: numberOf.get(line.userId)! },
        })),
      ],
      privateNotes: [...member.restrictions, ...mine.filter((line) => line.scope === "propio").map((line) => (line.section ? `${line.section}: ${line.text}` : line.text))],
      contactNames: around.map((c) => c.contactName),
    };
  };
}

export type ContextBuilder = ReturnType<typeof createContextBuilder>;
