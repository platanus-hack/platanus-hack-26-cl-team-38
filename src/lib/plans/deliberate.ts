import { screenText } from "@/lib/privacy/screen";
import { fold } from "@/lib/privacy/taxonomy";
import type { PlanAporte, PlanContent, PlanDecidedBy, PlanMessage } from "@/lib/types";
import type { Db } from "@/lib/users/profile";
import { createContextBuilder, type AgentContext } from "./context";
import { closePlan, loadPlan, recordMessage, saveVersion, type CallMeta, type PlanMember, type PlanSnapshot } from "./store";
import { describePlan, planInForce, transcript } from "./view";

// The deliberation of one plan. The models write; this code decides everything else: who speaks
// when, what each agent reads, which lines survive, whether there is consensus and when to stop.
// It always ends with a plan: agreed by every agent, decided by the orchestrator at the round
// limit, or closed by the code if the orchestrator cannot be reached.
// Each step reads what is already stored and does only what is missing, so a process that dies
// half way is resumed by calling this again.

export type Measured<T> = { output: T; meta: CallMeta };

// What the models return: no ids and no length limits. Everything is cut and checked here.
type Cited = { cita: string; texto: string };
export type MemberOpening = { postura: string; condiciones: { texto: string; dura: boolean }[]; aportes: Cited[] };
export type MemberResponse = { motivo: string; decision: "accept" | "adjust" | "block"; ajustes: { tema: string; pide: string }[]; aportes: Cited[] };
export type OrchestratorPlan = {
  resumen: string;
  decisiones: { tema: string; valor: string; porque: string }[];
  // `responsable` and `miembro` are member keys (M1, M2…), not ids.
  pasos: { que: string; responsable: string }[];
  abiertos: string[];
  desacuerdos: { miembro: string; tema: string; detalle: string }[];
};

export type MemberTurn = {
  me: PlanMember;
  members: PlanMember[];
  ownerId: string;
  intent: string;
  context: AgentContext;
  transcript: string;
  round: number;
  maxRounds: number;
  // The proposal to answer, already rendered. Null in the opening round.
  proposal: string | null;
};

export type OrchestratorTurn = {
  intent: string;
  members: { key: string; displayName: string; owner: boolean }[];
  transcript: string;
  previous: string | null;
  round: number;
  maxRounds: number;
  // True at the limit: no more rounds, this proposal is the plan.
  final: boolean;
};

export type Agents = {
  open(turn: MemberTurn): Promise<Measured<MemberOpening>>;
  respond(turn: MemberTurn): Promise<Measured<MemberResponse>>;
  propose(turn: OrchestratorTurn): Promise<Measured<OrchestratorPlan>>;
};

export type DeliberationDeps = { db: Db; agents: Agents; embed: (texts: string[]) => Promise<number[][]> };
export type Outcome = { status: "consenso" | "decidido"; version: number; decidedBy: PlanDecidedBy };

const MAX_APORTES = 6;
const MAX_ITEMS = 12;

function clip(text: string, max = 240): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

type Drop = "cita_inventada" | "privacidad" | "nombra_contacto";

// A line every participant will read: nothing the lexicon blocks, and no contact by name.
function publicLine(text: string, contactNames: string[], max?: number): { text: string } | { drop: Drop } {
  const line = clip(text, max);
  if (!line || screenText(line)) return { drop: "privacidad" };
  const folded = ` ${fold(line)} `;
  if (contactNames.some((name) => folded.includes(` ${fold(name)} `))) return { drop: "nombra_contacto" };
  return { text: line };
}

// Line ids are unique per person, and an agent reads lines of several people.
const lineKey = (a: Pick<PlanAporte, "lineId" | "contactId">) => `${a.contactId ?? ""}/${a.lineId}`;

function checkAportes(raw: Cited[], context: AgentContext, already: Set<string>): { aportes: PlanAporte[]; drops: Drop[] } {
  const aportes: PlanAporte[] = [];
  const drops: Drop[] = [];
  for (const { cita, texto } of raw.slice(0, MAX_APORTES)) {
    const ref = cita.replace(/[^a-z0-9]/gi, "").toUpperCase();
    const line = context.lines.find((l) => l.ref === ref);
    if (!line) {
      drops.push("cita_inventada");
      continue;
    }
    const source = { lineId: line.lineId, ...(line.contact ? { contactId: line.contact.id } : {}) };
    if (already.has(lineKey(source)) || aportes.some((a) => lineKey(a) === lineKey(source))) continue;
    const checked = publicLine(texto, context.contactNames);
    if ("drop" in checked) drops.push(checked.drop);
    else aportes.push({ ...source, texto: checked.text, origen: line.origen });
  }
  return { aportes, drops };
}

function keep<T>(items: T[], texts: (item: T) => string[], contactNames: string[], drops: Drop[]): T[] {
  return items.slice(0, MAX_ITEMS).filter((item) => {
    const failed = texts(item)
      .map((text) => publicLine(text, contactNames))
      .find((checked) => "drop" in checked);
    if (failed && "drop" in failed) drops.push(failed.drop);
    return !failed;
  });
}

function toContent(raw: OrchestratorPlan, plan: PlanSnapshot, keys: Map<string, string>, final: boolean): PlanContent {
  const drops: Drop[] = [];
  const idOf = (key: string) => keys.get(key.trim().toUpperCase()) ?? plan.members.find((m) => fold(m.displayName) === fold(key))?.personId;
  const resumen = publicLine(raw.resumen, [], 600);
  return {
    resumen: "text" in resumen ? resumen.text : clip(plan.intent, 600),
    decisiones: keep(raw.decisiones, (d) => [d.tema, d.valor], [], drops).map((d) => ({ tema: clip(d.tema, 80), valor: clip(d.valor), porque: clip(d.porque) })),
    pasos: keep(raw.pasos, (p) => [p.que], [], drops).map((p) => ({ que: clip(p.que), responsable: idOf(p.responsable) ?? plan.ownerId })),
    abiertos: keep(raw.abiertos, (a) => [a], [], drops).map((a) => clip(a)),
    desacuerdos: final
      ? keep(raw.desacuerdos, (d) => [d.tema, d.detalle], [], drops).flatMap((d) => {
          const personId = idOf(d.miembro);
          return personId ? [{ personId, tema: clip(d.tema, 80), detalle: clip(d.detalle) }] : [];
        })
      : [],
  };
}

const answeredIn = (plan: PlanSnapshot, round: number) =>
  new Set(
    plan.messages
      .filter(({ round: r, message }) => r === round && (message.agent === "miembro" || (message.agent === "verificador" && message.content.descartado === "turno")))
      .map(({ message }) => ("personId" in message ? message.personId : undefined)),
  );

// Every agent that answered accepted, and at least half of them answered: one that fails to
// respond does not hold the others back, but one voice alone is not an agreement.
function agreed(plan: PlanSnapshot, round: number): boolean {
  const answers = plan.messages.flatMap(({ round: r, message }) => (r === round && message.agent === "miembro" && message.content.tipo === "respuesta" ? [message.content.decision] : []));
  return answers.length * 2 >= plan.members.length && answers.every((decision) => decision === "accept");
}

function declaredHard(plan: PlanSnapshot, personId: string): boolean | undefined {
  const opening = plan.messages.find(({ message }) => message.agent === "miembro" && message.personId === personId && message.content.tipo === "postura")?.message;
  return opening?.agent === "miembro" && opening.content.tipo === "postura" ? opening.content.condiciones.some((c) => c.dura) : undefined;
}

const contributedBy = (plan: PlanSnapshot, personId: string) =>
  new Set(plan.messages.flatMap(({ message }) => (message.agent === "miembro" && message.personId === personId ? message.content.aportes.map(lineKey) : [])));

export async function deliberate(planId: string, deps: DeliberationDeps): Promise<Outcome | null> {
  const { db, agents } = deps;
  const loaded = await loadPlan(db, planId);
  if (!loaded) return null;
  let plan = loaded;
  const reload = async () => {
    plan = (await loadPlan(db, planId)) ?? plan;
  };
  const closed = (): Outcome | null => {
    const version = planInForce(plan);
    return plan.status !== "deliberando" && version?.decidedBy ? { status: plan.status, version: version.version, decidedBy: version.decidedBy } : null;
  };
  if (plan.status !== "deliberando") return closed();

  const buildContext = createContextBuilder(plan, deps);
  const names = new Map(plan.members.map((m) => [m.personId, m.displayName]));
  const keys = new Map(plan.members.map((m, i) => [`M${i + 1}`, m.personId]));

  async function close(version: number, decidedBy: PlanDecidedBy): Promise<Outcome> {
    await closePlan(db, planId, version, decidedBy);
    return { status: decidedBy === "consenso" ? "consenso" : "decidido", version, decidedBy };
  }

  async function memberRound(round: number) {
    const answered = answeredIn(plan, round);
    const pending = plan.members.filter((m) => !answered.has(m.personId));
    if (pending.length === 0) return;
    const proposal = plan.versions.find((v) => v.version === round);
    const said = transcript(plan);

    const turns = await Promise.allSettled(
      pending.map(async (me) => {
        const context = await buildContext(me, proposal?.content.abiertos ?? []);
        const turn: MemberTurn = {
          me,
          members: plan.members,
          ownerId: plan.ownerId,
          intent: plan.intent,
          context,
          transcript: said,
          round,
          maxRounds: plan.maxRounds,
          proposal: proposal ? describePlan(proposal.content, names) : null,
        };
        const answer = round === 0 ? ({ kind: "opening", ...(await agents.open(turn)) } as const) : ({ kind: "response", ...(await agents.respond(turn)) } as const);
        return { context, answer };
      }),
    );

    for (const [i, me] of pending.entries()) {
      const settled = turns[i];
      const discard = (descartado: "turno" | "aporte" | "texto", razon: Drop | "sin_respuesta") =>
        recordMessage(db, planId, round, { agent: "verificador", personId: me.personId, content: { descartado, razon } });
      if (settled.status === "rejected") {
        console.error(`plan ${planId}: el agente de ${me.personId} no respondió en la ronda ${round}:`, settled.reason);
        await discard("turno", "sin_respuesta");
        continue;
      }
      const { context, answer } = settled.value;
      const { aportes, drops } = checkAportes(answer.output.aportes, context, contributedBy(plan, me.personId));
      const textDrops: Drop[] = [];
      let message: PlanMessage;
      if (answer.kind === "opening") {
        const { output } = answer;
        const postura = publicLine(output.postura, context.contactNames);
        if ("drop" in postura) textDrops.push(postura.drop);
        message = {
          agent: "miembro",
          personId: me.personId,
          content: {
            tipo: "postura",
            postura: "text" in postura ? postura.text : "Se suma al plan.",
            condiciones: keep(output.condiciones, (c) => [c.texto], context.contactNames, textDrops).map((c) => ({ texto: clip(c.texto), dura: c.dura })),
            aportes,
          },
        };
      } else {
        const { output } = answer;
        const motivo = publicLine(output.motivo, context.contactNames);
        if ("drop" in motivo) textDrops.push(motivo.drop);
        const ajustes = keep(output.ajustes, (a) => [a.tema, a.pide], context.contactNames, textDrops).map((a) => ({ tema: clip(a.tema, 80), pide: clip(a.pide) }));
        // Blocking is for a condition the person cannot do without: an agent that declared none asks for a change instead.
        const decision = output.decision === "block" && declaredHard(plan, me.personId) === false ? "adjust" : output.decision;
        const fallback = { accept: "Acepta la propuesta.", adjust: "Pide un cambio a la propuesta.", block: "La propuesta no cumple una de sus condiciones." }[decision];
        message = { agent: "miembro", personId: me.personId, content: { tipo: "respuesta", decision, motivo: "text" in motivo ? motivo.text : fallback, ajustes, aportes } };
      }
      await recordMessage(db, planId, round, message, answer.meta);
      for (const drop of drops) await discard("aporte", drop);
      for (const drop of textDrops) await discard("texto", drop);
    }
    await reload();
  }

  // False when the orchestrator could not be reached, after one more try.
  async function propose(version: number, final: boolean): Promise<boolean> {
    const previous = plan.versions.at(-1);
    const turn: OrchestratorTurn = {
      intent: plan.intent,
      members: [...keys].map(([key, personId]) => ({ key, displayName: names.get(personId)!, owner: personId === plan.ownerId })),
      transcript: transcript(plan),
      previous: previous ? describePlan(previous.content, names) : null,
      round: Math.min(version, plan.maxRounds),
      maxRounds: plan.maxRounds,
      final,
    };
    for (const attempt of [1, 2]) {
      try {
        const { output, meta } = await agents.propose(turn);
        await saveVersion(db, planId, version, toContent(output, plan, keys, final));
        await recordMessage(db, planId, turn.round, { agent: "orquestador", content: { version, final } }, meta);
        await reload();
        return true;
      } catch (error) {
        console.error(`plan ${planId}: el orquestador falló (intento ${attempt}):`, error);
      }
    }
    return false;
  }

  // Without an orchestrator the plan still closes: with the last proposal, or with the intent
  // itself when there never was one.
  async function closeByCode(): Promise<Outcome> {
    await recordMessage(db, planId, Math.min(plan.round, plan.maxRounds), { agent: "verificador", content: { descartado: "plan", razon: "orquestador_caido" } });
    const last = plan.versions.at(-1);
    if (last) return close(last.version, "codigo");
    await saveVersion(db, planId, 1, {
      resumen: clip(plan.intent, 600),
      decisiones: [],
      pasos: [{ que: "Conversar el plan entre los participantes, con las posturas de cada uno a la vista", responsable: plan.ownerId }],
      abiertos: [],
      desacuerdos: [],
    });
    return close(1, "codigo");
  }

  await memberRound(0);
  for (let round = 1; round <= plan.maxRounds; round++) {
    if (!plan.versions.some((v) => v.version === round) && !(await propose(round, false))) return closeByCode();
    await memberRound(round);
    if (agreed(plan, round)) return close(round, "consenso");
  }
  const decision = plan.maxRounds + 1;
  if (plan.versions.some((v) => v.version === decision) || (await propose(decision, true))) return close(decision, "orquestador");
  return closeByCode();
}
