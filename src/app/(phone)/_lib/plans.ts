"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import {
  PlanGraphSchema,
  PlanSummarySchema,
  PlanViewSchema,
  type PlanGraph,
  type PlanSummary,
  type PlanView,
} from "@/lib/types";
import { api } from "./api";
import { COPY } from "./copy";
import { type Coincidence, contactsOf, DEMO, type Encounter, useEncounters } from "./people";
import { going, paced } from "./plan-network";
import { getPhone, type PhoneState } from "./store";
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
    const response = await api("/api/plans", {
      method: "POST",
      body: JSON.stringify({ personId: getPhone().personId, intent, memberIds, restrictions }),
    });
    const json: unknown = await response.json().catch(() => null);
    if (response.ok) return { ok: true, planId: z.object({ planId: z.string() }).parse(json).planId };
    return {
      ok: false,
      error: response.status === 409 ? C.onlyConnections : response.status === 401 ? C.noUser : C.failed,
    };
  } catch {
    return { ok: false, error: C.failed };
  }
}

export type LoadedGraph = PlanGraph & { error?: string };

// A 401 after a check-in means another device claimed this personId first: the check-in itself
// never rejects a key, so this is the first place the phone finds out.
const unreadable = (status?: number): LoadedGraph => ({
  connections: [],
  error: status !== 401 ? C.graphFailed : getPhone().room ? C.otherDevice : C.noUser,
});

/** Who you can plan with (undefined while loading, null in demo mode). */
export function usePlanGraph(): LoadedGraph | null | undefined {
  const [graph, setGraph] = useState<LoadedGraph | null | undefined>(DEMO ? null : undefined);
  useEffect(() => {
    if (DEMO) return;
    let alive = true;
    api(`/api/plans/graph?personId=${me()}`)
      .then(async (r): Promise<LoadedGraph> => (r.ok ? PlanGraphSchema.parse(await r.json()) : unreadable(r.status)))
      .catch(() => unreadable())
      .then((g) => alive && setGraph(g));
    return () => {
      alive = false;
    };
  }, []);
  return graph;
}

/** Your connections as people to invite: with their public Intereses when they are around. */
function connectionEncounters(graph: PlanGraph, encounters: Encounter[]): Encounter[] {
  const known = new Map(encounters.map((e) => [e.person.personId, e]));
  return graph.connections.map((c): Encounter => ({
    ...(known.get(c.personId) ?? {
      person: { personId: c.personId, displayName: c.displayName, topics: [] },
      distanceM: 0,
      radiusM: 50,
      at: new Date(0).toISOString(),
      place: "",
    }),
    relation: "conocido",
  }));
}

/**
 * Your Contactos are your connections, the ones both of you accepted, never who only shares
 * Intereses with you. Demo mode has no backend: there they are the requests you accepted on this phone.
 */
export function connectionsOf(s: PhoneState, graph: PlanGraph | null, encounters: Encounter[]): Coincidence[] {
  if (graph) return contactsOf(s, connectionEncounters(graph, encounters));
  return contactsOf(s, encounters).filter((c) => s.relations?.[c.person.personId]);
}

/** Your Contactos (undefined while loading). */
export function useContacts(s: PhoneState | undefined): Coincidence[] | undefined {
  const encounters = useEncounters();
  const graph = usePlanGraph();
  if (!s || !encounters || graph === undefined) return undefined;
  return connectionsOf(s, graph, encounters);
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

// One plan, followed while its Agentes deliberate. The phone and the desktop panel watch the same
// plan at once, so there is one poller per plan and both read the same state: the messages come
// out one at a time (a whole round lands together), and once the plan closes whoever is in it
// confirms on their own, a little apart, so nobody has to tap behind the scenes in a demo.
// Those confirmations are only shown: nothing is saved.
const REVEAL_MS = 750;
const CONFIRM_MS = 450;

export type PlanState = { plan?: PlanView; missing?: boolean; confirmed: string[] };
const EMPTY: PlanState = { confirmed: [] };

type Watch = {
  raw?: PlanView;
  missing?: boolean;
  /** Messages already out, and how many of `going(raw)` have confirmed. */
  shown: number;
  confirmed: number;
  state: PlanState;
  listeners: Set<() => void>;
  poll?: ReturnType<typeof setTimeout>;
  pace?: ReturnType<typeof setTimeout>;
  alive: boolean;
};
const watches = new Map<string, Watch>();

function emit(w: Watch) {
  w.state = w.missing
    ? { missing: true, confirmed: [] }
    : w.raw
      ? { plan: paced(w.raw, w.shown), confirmed: going(w.raw).slice(0, w.confirmed) }
      : EMPTY;
  for (const listener of w.listeners) listener();
}

// What is left to show, one step at a time.
function pace(w: Watch) {
  if (w.pace || !w.raw) return;
  const { raw } = w;
  const revealing = w.shown < raw.messages.length;
  const confirming = !revealing && raw.status !== "deliberando" && w.confirmed < going(raw).length;
  if (!revealing && !confirming) return;
  w.pace = setTimeout(
    () => {
      w.pace = undefined;
      if (!w.alive) return;
      if (revealing) w.shown += 1;
      else w.confirmed += 1;
      emit(w);
      pace(w);
    },
    revealing ? REVEAL_MS : w.confirmed === 0 ? CONFIRM_MS * 2 : CONFIRM_MS,
  );
}

function take(w: Watch, plan: PlanView) {
  // What was already there when you opened the plan is not replayed.
  if (!w.raw) {
    w.shown = plan.messages.length;
    w.confirmed = plan.status === "deliberando" ? 0 : going(plan).length;
  }
  w.raw = plan;
  emit(w);
  pace(w);
}

function watch(id: string): Watch {
  const w: Watch = { shown: 0, confirmed: 0, state: EMPTY, listeners: new Set(), alive: true };
  const tick = async () => {
    const response = await api(`/api/plans/${encodeURIComponent(id)}?personId=${me()}`).catch(() => null);
    if (!w.alive) return;
    let open = true;
    if (response?.ok) {
      const parsed = z.object({ plan: PlanViewSchema }).safeParse(await response.json().catch(() => null));
      if (!w.alive) return;
      if (parsed.success) {
        take(w, parsed.data.plan);
        open = parsed.data.plan.status === "deliberando";
      }
    } else if (response && (response.status === 404 || response.status === 401)) {
      w.missing = true;
      emit(w);
      open = false;
    }
    if (open) w.poll = setTimeout(tick, POLL_MS);
  };
  void tick();
  return w;
}

export function usePlan(id: string): PlanState {
  const subscribe = useCallback(
    (listener: () => void) => {
      const w = watches.get(id) ?? watch(id);
      watches.set(id, w);
      w.listeners.add(listener);
      return () => {
        w.listeners.delete(listener);
        if (w.listeners.size > 0) return;
        w.alive = false;
        clearTimeout(w.poll);
        clearTimeout(w.pace);
        watches.delete(id);
      };
    },
    [id],
  );
  return useSyncExternalStore(
    subscribe,
    () => watches.get(id)?.state ?? EMPTY,
    () => EMPTY,
  );
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
  for (const key of new Set([
    ...current.keys(),
    ...Object.keys(synced).filter((k) => k.startsWith(`${s.personId}:`)),
  ])) {
    const markdown = current.get(key) ?? "";
    if (synced[key] === markdown) continue;
    const response = await api("/api/context", {
      method: "POST",
      body: JSON.stringify({ personId: s.personId, source: key.slice(s.personId.length + 1), markdown }),
    }).catch(() => null);
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
