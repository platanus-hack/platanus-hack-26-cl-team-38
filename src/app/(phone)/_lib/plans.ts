"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { PlanGraphSchema, PlanSummarySchema, PlanViewSchema, type PlanGraph, type PlanSummary, type PlanView } from "@/lib/types";
import { api } from "./api";
import { COPY } from "./copy";
import { DEMO, type Encounter } from "./people";
import { getPhone } from "./store";
import type { Profile } from "../onboarding/store";

// Plans live in the backend: the phone creates one, then watches its Agentes deliberate. Every
// call goes with this phone's key, and a plan is only readable by its participants.

const C = COPY.plan;
const POLL_MS = 1500;
const me = () => encodeURIComponent(getPhone().personId);

/** The ids the backend gives plans, as opposed to the demo Conversaciones made on the phone. */
export const isPlanId = (id: string) => id.startsWith("plan-");

export type Created = { ok: true; planId: string } | { ok: false; error: string };

export async function createPlan(intent: string, memberIds: string[], restrictions: string[]): Promise<Created> {
  try {
    const response = await api("/api/plans", { method: "POST", body: JSON.stringify({ personId: getPhone().personId, intent, memberIds, restrictions }) });
    const json: unknown = await response.json().catch(() => null);
    if (response.ok) return { ok: true, planId: z.object({ planId: z.string() }).parse(json).planId };
    return { ok: false, error: response.status === 409 ? C.onlyConnections : response.status === 401 ? C.noUser : C.failed };
  } catch {
    return { ok: false, error: C.failed };
  }
}

/** Who you can plan with (undefined while loading, null in demo mode). */
export function usePlanGraph(): PlanGraph | null | undefined {
  const [graph, setGraph] = useState<PlanGraph | null | undefined>(DEMO ? null : undefined);
  useEffect(() => {
    if (DEMO) return;
    let alive = true;
    api(`/api/plans/graph?personId=${me()}`)
      .then(async (r) => (r.ok ? PlanGraphSchema.parse(await r.json()) : { connections: [] }))
      .catch(() => ({ connections: [] }))
      .then((g) => alive && setGraph(g));
    return () => {
      alive = false;
    };
  }, []);
  return graph;
}

/** Your connections as people to invite: with their public Intereses when they are around. */
export function connectionEncounters(graph: PlanGraph, encounters: Encounter[]): Encounter[] {
  const known = new Map(encounters.map((e) => [e.person.personId, e]));
  return graph.connections.map(
    (c): Encounter =>
      ({ ...(known.get(c.personId) ?? { person: { personId: c.personId, displayName: c.displayName, topics: [] }, distanceM: 0, radiusM: 50, at: new Date(0).toISOString(), place: "" }), relation: "conocido" }),
  );
}

/** Your plans, newest first (empty in demo mode and while loading). */
export function usePlans(): PlanSummary[] {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  useEffect(() => {
    if (DEMO) return;
    let alive = true;
    api(`/api/plans?personId=${me()}`)
      .then(async (r) => (r.ok ? z.object({ plans: z.array(PlanSummarySchema) }).parse(await r.json()).plans : []))
      .catch(() => [])
      .then((list) => alive && setPlans(list));
    return () => {
      alive = false;
    };
  }, []);
  return plans;
}

/** One plan, followed while its Agentes deliberate. */
export function usePlan(id: string): { plan?: PlanView; missing?: boolean } {
  const [state, setState] = useState<{ plan?: PlanView; missing?: boolean }>({});
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const response = await api(`/api/plans/${encodeURIComponent(id)}?personId=${me()}`).catch(() => null);
      if (!alive) return;
      let open = true;
      if (response?.ok) {
        const parsed = z.object({ plan: PlanViewSchema }).safeParse(await response.json().catch(() => null));
        if (!alive) return;
        if (parsed.success) {
          setState({ plan: parsed.data.plan });
          open = parsed.data.plan.status === "deliberando";
        }
      } else if (response && (response.status === 404 || response.status === 401)) {
        setState({ missing: true });
        open = false;
      }
      if (open) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id]);
  return state;
}

const SYNCED_KEY = "team38.profiles.synced";

// The detailed profile is read by the Agentes on the server, so every change to it goes up: a new
// one from an assistant, a line you removed, a profile you emptied. What already went is
// remembered per assistant, so opening the app does not send it again.
export async function syncProfiles(profiles: Profile[]): Promise<void> {
  const s = getPhone();
  if (DEMO || !s.room) return;
  let synced: Record<string, string> = {};
  try {
    synced = JSON.parse(localStorage.getItem(SYNCED_KEY) ?? "{}") as Record<string, string>;
  } catch {
    // Unreadable marker: send everything again.
  }
  const current = new Map(profiles.map((p) => [`${s.personId}:${p.source}`, p.markdown]));
  for (const key of new Set([...current.keys(), ...Object.keys(synced).filter((k) => k.startsWith(`${s.personId}:`))])) {
    const markdown = current.get(key) ?? "";
    if (synced[key] === markdown) continue;
    const response = await api("/api/context", { method: "POST", body: JSON.stringify({ personId: s.personId, source: key.slice(s.personId.length + 1), markdown }) }).catch(() => null);
    if (!response?.ok) continue;
    if (markdown) synced[key] = markdown;
    else delete synced[key];
    try {
      localStorage.setItem(SYNCED_KEY, JSON.stringify(synced));
    } catch {
      // Storage blocked: it goes up again next time, which is harmless.
    }
  }
}
