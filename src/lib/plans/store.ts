import { z } from "zod";
import {
  PlanContentSchema,
  PlanDecidedBySchema,
  PlanMessageSchema,
  PlanStatusSchema,
  PlanSummarySchema,
  type PlanContent,
  type PlanDecidedBy,
  type PlanGraph,
  type PlanMessage,
  type PlanSummary,
} from "@/lib/types";
import { call, type Db } from "@/lib/users/profile";

// Plans and the context agents read, as stored. All the SQL is in
// supabase/migrations/20261122100000_plans_and_context.sql; this validates and translates.

const SnapshotSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  intent: z.string(),
  status: PlanStatusSchema,
  round: z.number(),
  maxRounds: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  members: z.array(z.object({ personId: z.string(), displayName: z.string(), restrictions: z.array(z.string()) })),
  versions: z.array(
    z.object({
      version: z.number(),
      content: PlanContentSchema,
      decidedBy: PlanDecidedBySchema.nullable(),
      createdAt: z.string(),
    }),
  ),
  messages: z.array(
    z.object({
      id: z.number(),
      round: z.number(),
      agent: z.string(),
      personId: z.string().nullable(),
      content: z.unknown(),
      createdAt: z.string(),
    }),
  ),
});

export type StoredMessage = { id: number; round: number; createdAt: string; message: PlanMessage };
export type PlanSnapshot = Omit<z.infer<typeof SnapshotSchema>, "messages"> & { messages: StoredMessage[] };
export type PlanMember = PlanSnapshot["members"][number];

export async function loadPlan(db: Db, planId: string): Promise<PlanSnapshot | null> {
  const raw = await call(db, "plan_snapshot", { p_plan: planId });
  if (!raw) return null;
  const { messages, ...plan } = SnapshotSchema.parse(raw);
  return {
    ...plan,
    messages: messages.map(({ id, round, createdAt, agent, personId, content }) => ({
      id,
      round,
      createdAt,
      message: PlanMessageSchema.parse({ agent, content, ...(personId ? { personId } : {}) }),
    })),
  };
}

export type NewPlan = {
  id: string;
  ownerId: string;
  intent: string;
  others: string[];
  restrictions: string[];
  maxRounds?: number;
};

// False when someone in `others` is not an accepted connection of the owner.
export async function createPlan(db: Db, plan: NewPlan): Promise<boolean> {
  const created = await call(db, "create_plan", {
    p_id: plan.id,
    p_owner: plan.ownerId,
    p_intent: plan.intent,
    p_others: plan.others,
    p_restrictions: plan.restrictions,
    ...(plan.maxRounds ? { p_max_rounds: plan.maxRounds } : {}),
  });
  return created === true;
}

export async function listPlans(db: Db, me: string): Promise<PlanSummary[]> {
  type Row = {
    id: string;
    owner_id: string;
    intent: string;
    status: string;
    round: number;
    max_rounds: number;
    members: unknown;
    resumen: string | null;
    updated_at: string;
  };
  return ((await call(db, "plans_of", { p_me: me })) as Row[]).map((row) =>
    PlanSummarySchema.parse({
      id: row.id,
      ownerId: row.owner_id,
      intent: row.intent,
      status: row.status,
      round: Math.min(row.round, row.max_rounds),
      maxRounds: row.max_rounds,
      members: row.members,
      resumen: row.resumen,
      updatedAt: row.updated_at,
    }),
  );
}

// Who the person can plan with, and how many contacts of their own each one brings.
export async function planGraph(db: Db, me: string): Promise<PlanGraph> {
  type Row = { from_id: string; to_id: string; to_name: string; level: number };
  const rows = (await call(db, "plan_graph", { p_me: me })) as Row[];
  return {
    connections: rows
      .filter((row) => row.level === 2)
      .map((row) => ({
        personId: row.to_id,
        displayName: row.to_name,
        contacts: rows.filter((r) => r.level === 3 && r.from_id === row.to_id).length,
      })),
  };
}

export type Contact = { contactId: string; contactName: string };

export async function neighbourhood(db: Db, planId: string, memberId: string): Promise<Contact[]> {
  type Row = { contact_id: string; contact_name: string };
  return ((await call(db, "plan_neighbourhood", { p_plan: planId, p_member: memberId })) as Row[]).map((row) => ({
    contactId: row.contact_id,
    contactName: row.contact_name,
  }));
}

export type OwnLine = {
  lineId: string;
  kind: "topico" | "perfil";
  scope: "red" | "propio";
  section: string;
  text: string;
};

export async function ownContext(db: Db, userId: string): Promise<OwnLine[]> {
  type Row = { line_id: string; kind: OwnLine["kind"]; scope: OwnLine["scope"]; section: string; text: string };
  return ((await call(db, "own_context", { p_user: userId })) as Row[]).map((row) => ({
    lineId: row.line_id,
    kind: row.kind,
    scope: row.scope,
    section: row.section,
    text: row.text,
  }));
}

export type NetworkLine = {
  userId: string;
  lineId: string;
  kind: "topico" | "perfil";
  section: string;
  text: string;
  score: number;
};

export async function networkContext(
  db: Db,
  contacts: string[],
  queries: number[][] | null,
  limit: number,
): Promise<NetworkLine[]> {
  if (contacts.length === 0) return [];
  type Row = {
    user_id: string;
    line_id: string;
    kind: NetworkLine["kind"];
    section: string;
    text: string;
    score: number;
  };
  return (
    (await call(db, "network_context", { p_contacts: contacts, p_queries: queries, p_limit: limit })) as Row[]
  ).map((row) => ({
    userId: row.user_id,
    lineId: row.line_id,
    kind: row.kind,
    section: row.section,
    text: row.text,
    score: row.score,
  }));
}

export type ContextLine = { lineId: string; section: string; text: string; embedding: number[] };

export async function saveContext(
  db: Db,
  userId: string,
  scope: "red" | "propio",
  source: string,
  lines: ContextLine[],
): Promise<number> {
  return (await call(db, "save_context", {
    p_user: userId,
    p_scope: scope,
    p_source: source,
    p_lines: lines,
  })) as number;
}

export type CallMeta = { model?: string; ms?: number; tokensIn?: number; tokensOut?: number; webSearches?: number };

export async function recordMessage(
  db: Db,
  planId: string,
  round: number,
  message: PlanMessage,
  meta: CallMeta = {},
): Promise<void> {
  const parsed = PlanMessageSchema.parse(message);
  await call(db, "record_plan_message", {
    p_plan: planId,
    p_round: round,
    p_agent: parsed.agent,
    p_content: parsed.content,
    p_person_id: "personId" in parsed ? (parsed.personId ?? null) : null,
    p_meta: meta,
  });
}

export async function saveVersion(db: Db, planId: string, version: number, content: PlanContent): Promise<void> {
  await call(db, "save_plan_version", {
    p_plan: planId,
    p_version: version,
    p_content: PlanContentSchema.parse(content),
  });
}

export async function closePlan(db: Db, planId: string, version: number, decidedBy: PlanDecidedBy): Promise<void> {
  await call(db, "close_plan", { p_plan: planId, p_version: version, p_decided_by: decidedBy });
}

export async function claimPlan(db: Db, planId: string, staleSeconds?: number): Promise<boolean> {
  return (
    (await call(db, "claim_plan", {
      p_plan: planId,
      ...(staleSeconds === undefined ? {} : { p_stale_seconds: staleSeconds }),
    })) === true
  );
}
