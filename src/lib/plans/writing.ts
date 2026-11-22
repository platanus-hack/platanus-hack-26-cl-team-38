import type { PlanView } from "@/lib/types";

// Who the plan is waiting on, read from what is already stored: the agents that have not answered
// the current round, or the orchestrator once all of them have.
export function writing(plan: Pick<PlanView, "status" | "messages"> & { members: { personId: string }[] }): { members: string[]; orchestrator: boolean } {
  if (plan.status !== "deliberando") return { members: [], orchestrator: false };
  const round = Math.max(0, ...plan.messages.map((m) => m.round));
  const answered = new Set(plan.messages.filter((m) => m.round === round && m.agent !== "orquestador" && m.personId).map((m) => m.personId));
  const members = plan.members.map((m) => m.personId).filter((id) => !answered.has(id));
  return { members, orchestrator: members.length === 0 };
}
