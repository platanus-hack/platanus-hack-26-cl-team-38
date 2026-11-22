import "server-only";
import { embed } from "@/lib/embeddings";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAnthropicAgents } from "./agents";
import { deliberate, type Agents } from "./deliberate";
import { claimPlan } from "./store";

// Deliberations run inside this process, after the request that started them has answered. What
// is running is kept on globalThis so a dev reload does not start a second copy; across
// processes, the claim in the base is what keeps a plan with one runner.
const holder = globalThis as typeof globalThis & { planRuns?: Set<string>; planAgents?: Agents };
const running = (holder.planRuns ??= new Set());

export const isDeliberatingHere = (planId: string) => running.has(planId);

// Also how a plan left half way by a process that died is picked up: the claim goes stale, and
// the next phone that looks at the plan calls this.
export async function runDeliberation(planId: string): Promise<void> {
  if (running.has(planId)) return;
  running.add(planId);
  try {
    if (!(await claimPlan(supabaseAdmin, planId))) return;
    await deliberate(planId, { db: supabaseAdmin, agents: (holder.planAgents ??= createAnthropicAgents()), embed });
  } catch (error) {
    console.error(`plan ${planId}:`, error);
  } finally {
    running.delete(planId);
  }
}
