import { mentionsPrivate } from "@/lib/privacy/agent-brief";
import { screenText } from "@/lib/privacy/screen";
import { LogEntrySchema, LogSchema, MesaDecisionSchema, type Log, type LogEntry, type MesaDecision } from "@/lib/types";
import { call, type Db } from "@/lib/users/profile";

// What happens inside a mesa is kept in two places. The main decisions of its agents (the plan
// proposed, each member agent's answer, what the verifier discarded) are rows of
// `deliberation_messages`, read by the room. Everything else is a log: who, which mesa, when and
// a measurement, read only by the person whose agent it was.
// SQL in supabase/migrations/20261122000000_mesa_decisions_and_logs.sql.

// Appends one log and returns its id, to hang a decision from it. A log that cannot be written
// (the base is down, the user has no profile yet) must not stop a deliberation: it returns null.
// An entry the contract rejects is a bug in the caller, and that does throw.
export async function writeLog(db: Db, entry: LogEntry): Promise<number | null> {
  const { actor, event, detail, userId, mesaId } = LogEntrySchema.parse(entry);
  try {
    return (await call(db, "write_log", { p_actor: actor, p_event: event, p_detail: detail, p_user_id: userId ?? null, p_mesa_id: mesaId ?? null })) as number;
  } catch (error) {
    console.error("log:", error);
    return null;
  }
}

type Recorded = { ok: true; id: number } | { ok: false; reason: "privacidad" | "sin_mesa" };

// Files a main decision under its mesa. The orchestrating code decides what is one, never the
// model. A member agent's `motivo` is the only free text and the room reads it, so it goes
// through the lexicon and must not name any of that person's private topics (`personality`, from
// agentBrief()): a line that fails is not stored.
export async function recordDecision(db: Db, mesaId: string, decision: MesaDecision, options: { logId?: number | null; personality?: string[] } = {}): Promise<Recorded> {
  const parsed = MesaDecisionSchema.parse(decision);
  if (parsed.agent === "miembro") {
    if (!options.personality) throw new Error("recordDecision: la decisión de un agente de miembro necesita personality");
    const { motivo } = parsed.content;
    if (screenText(motivo) || mentionsPrivate(motivo, { personality: options.personality }).length > 0) return { ok: false, reason: "privacidad" };
  }
  const id = await call(db, "record_decision", {
    p_mesa_id: mesaId,
    p_agent: parsed.agent,
    p_content: parsed.content,
    p_person_id: parsed.agent === "miembro" ? parsed.personId : null,
    p_log_id: options.logId ?? null,
  });
  return typeof id === "number" ? { ok: true, id } : { ok: false, reason: "sin_mesa" };
}

type LogRow = { id: number; mesa_id: string | null; actor: string; event: string; detail: unknown; created_at: string };

// Only the caller's own: the logs of their agent and their own actions, from the last week.
export async function listLogs(db: Db, me: string, mesaId?: string): Promise<Log[]> {
  return ((await call(db, "logs_of", { p_me: me, p_mesa_id: mesaId ?? null })) as LogRow[]).map((row) =>
    LogSchema.parse({ id: row.id, mesaId: row.mesa_id, actor: row.actor, event: row.event, detail: row.detail, createdAt: row.created_at }),
  );
}
