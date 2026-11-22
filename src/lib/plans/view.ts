import { PlanViewSchema, type PlanContent, type PlanMessage, type PlanMessageView, type PlanView } from "@/lib/types";
import type { PlanSnapshot, StoredMessage } from "./store";

// One plan, cut down to what a participant (or another agent) may read: the public lines of every
// agent, and who of a network said something only for the person whose network it is.

type Names = Map<string, string>;

const nameOf = (names: Names, personId: string | undefined) => (personId && names.get(personId)) || "alguien";
const bare = (text: string) => text.replace(/[.;\s]+$/, "");

export function planInForce(plan: Pick<PlanSnapshot, "versions">) {
  return plan.versions.find((v) => v.decidedBy) ?? plan.versions.at(-1) ?? null;
}

export function describePlan(content: PlanContent, names: Names): string {
  return [
    content.resumen,
    ...content.decisiones.map((d) => `- ${d.tema}: ${d.valor}${d.porque ? ` (${d.porque})` : ""}`),
    ...content.pasos.map((p) => `- Paso: ${p.que} · responsable: ${nameOf(names, p.responsable)}`),
    ...content.abiertos.map((a) => `- Abierto: ${a}`),
    ...content.desacuerdos.map((d) => `- Desacuerdo de ${nameOf(names, d.personId)} sobre ${d.tema}: ${d.detalle}`),
  ].join("\n");
}

// The message as one line. `null` for what the code discarded without anyone needing to know.
function textOf(message: PlanMessage, plan: PlanSnapshot, names: Names): string | null {
  if (message.agent === "orquestador") {
    const version = plan.versions.find((v) => v.version === message.content.version);
    const resumen = version?.content.resumen ?? "";
    return message.content.final ? `Decisión final: ${resumen}` : `Propuesta ${message.content.version}: ${resumen}`;
  }
  if (message.agent === "verificador") {
    if (message.content.descartado === "turno") return `El Agente de ${nameOf(names, message.personId)} no respondió en esta ronda.`;
    if (message.content.descartado === "plan") return "El orquestador no respondió: el plan se cierra con lo último que había.";
    return null;
  }
  const { content } = message;
  if (content.tipo === "postura") {
    const conditions = content.condiciones.map((c) => `${bare(c.texto)}${c.dura ? " (no negociable)" : ""}`);
    return conditions.length ? `${content.postura} Condiciones: ${conditions.join("; ")}.` : content.postura;
  }
  const asks = content.ajustes.map((a) => `${a.tema}: ${bare(a.pide)}`);
  return asks.length ? `${content.motivo} Pide: ${asks.join("; ")}.` : content.motivo;
}

function toView(stored: StoredMessage, plan: PlanSnapshot, names: Names, reader: string | null, contacts: Names): PlanMessageView | null {
  const { message } = stored;
  const text = textOf(message, plan, names);
  if (text === null) return null;
  const author = "personId" in message ? (message.personId ?? null) : null;
  return {
    id: stored.id,
    round: stored.round,
    agent: message.agent,
    personId: author,
    text,
    ...(message.agent === "miembro" && message.content.tipo === "respuesta" ? { decision: message.content.decision } : {}),
    aportes:
      message.agent === "miembro"
        ? message.content.aportes.map((a) => ({
            texto: a.texto,
            origen: a.origen,
            ...(a.contactId && reader === author && contacts.has(a.contactId) ? { contacto: contacts.get(a.contactId) } : {}),
          }))
        : [],
    createdAt: stored.createdAt,
  };
}

// The conversation as the agents read it: no reader, so no contact is ever named.
export function transcript(plan: PlanSnapshot): string {
  const names: Names = new Map(plan.members.map((m) => [m.personId, m.displayName]));
  return plan.messages
    .map((stored) => toView(stored, plan, names, null, new Map()))
    .filter((m): m is PlanMessageView => m !== null)
    .map((m) => {
      const who = m.agent === "miembro" ? `Agente de ${nameOf(names, m.personId ?? undefined)}` : m.agent === "orquestador" ? "Orquestador" : "Sistema";
      const decision = m.decision ? ` [${m.decision}]` : "";
      const aportes = m.aportes.map((a) => `\n    aporta${a.origen === "red" ? ` (de un contacto de ${nameOf(names, m.personId ?? undefined)})` : ""}: ${a.texto}`).join("");
      return `[ronda ${m.round}] ${who}${decision}: ${m.text}${aportes}`;
    })
    .join("\n");
}

// `contacts`: the names of the reader's own contacts, by id, so they see who of their network
// their agent quoted. Null when the reader is not in the plan.
export function viewPlan(plan: PlanSnapshot, reader: string, contacts: Names = new Map()): PlanView | null {
  const me = plan.members.find((m) => m.personId === reader);
  if (!me) return null;
  const names: Names = new Map(plan.members.map((m) => [m.personId, m.displayName]));
  const inForce = planInForce(plan);
  return PlanViewSchema.parse({
    id: plan.id,
    ownerId: plan.ownerId,
    intent: plan.intent,
    status: plan.status,
    round: Math.min(plan.round, plan.maxRounds),
    maxRounds: plan.maxRounds,
    members: plan.members.map((m) => ({ personId: m.personId, displayName: m.displayName })),
    myRestrictions: me.restrictions,
    plan: inForce && { version: inForce.version, content: inForce.content, decidedBy: inForce.decidedBy },
    messages: plan.messages.map((stored) => toView(stored, plan, names, reader, contacts)).filter((m) => m !== null),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  });
}
