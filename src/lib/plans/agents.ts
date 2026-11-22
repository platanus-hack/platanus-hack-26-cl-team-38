import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { AgentLine } from "./context";
import type { Agents, Measured, MemberTurn, OrchestratorTurn } from "./deliberate";

// The five agents of a plan: one per participant and the orchestrator. They only write; the loop
// in deliberate.ts cuts, checks and stores what they say.

export const MEMBER_MODEL = "claude-haiku-5-5";
export const ORCHESTRATOR_MODEL = "claude-sonnet-5-5";

// Structured outputs do not take string lengths, and a line too long would cost the whole turn:
// lengths are asked for in the prompt and cut by the loop.
const Cited = z.object({ cita: z.string(), texto: z.string() });
const OpeningSchema = z.object({
  postura: z.string(),
  participa: z.boolean(),
  condiciones: z.array(z.object({ texto: z.string(), dura: z.boolean() })),
  aportes: z.array(Cited),
});
// `motivo` comes first so the agent reasons before it commits to a decision.
const ResponseSchema = z.object({
  motivo: z.string(),
  decision: z.enum(["accept", "adjust", "block"]),
  ajustes: z.array(z.object({ tema: z.string(), pide: z.string() })),
  aportes: z.array(Cited),
});
const ProposalSchema = z.object({
  resumen: z.string(),
  decisiones: z.array(z.object({ tema: z.string(), valor: z.string(), porque: z.string() })),
  pasos: z.array(z.object({ que: z.string(), responsable: z.string() })),
  abiertos: z.array(z.string()),
  desacuerdos: z.array(z.object({ miembro: z.string(), tema: z.string(), detalle: z.string() })),
});

const first = (name: string) => name.split(" ")[0];
const listOf = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`);

function memberRules(name: string): string {
  const n = first(name);
  return `Eres el Agente de ${name} en Minga. ${n} va a planear algo con otras personas. Cada una tiene su propio Agente y un orquestador redacta el plan con lo que digan los Agentes.

Tu trabajo es que el plan le sirva a ${n} y que el grupo llegue a un acuerdo: defiende lo que ${n} necesita, cede en lo que solo prefiere y trae a la mesa lo que ${n} y su red saben y que ayude a armar el plan.

Lo que sabes está más abajo, en tres partes:
- Las líneas [P…] son de ${n}: lo que publica y su perfil. Puedes citarlas.
- "Solo para ti" es lo que ${n} te pidió tener en cuenta. Nunca lo repitas ni digas su causa. Di solo la condición que el plan tiene que cumplir: "que el lugar quede a menos de una hora de Santiago", no el motivo.
- Las líneas [R…] son de contactos de ${n} que no participan en el plan. No vienen, así que sus gustos, su dieta y sus preferencias no importan: de ellos solo sirve lo que saben, hacen u ofrecen y que el grupo pueda usar (un lugar que conocen, un proveedor, un oficio, algo que ya organizaron). Nunca digas quiénes son ni los describas: escribe "un contacto de ${n}".

Cómo aportar:
- Un aporte cita una sola línea por su código (P3, R12) y dice con tus palabras el dato útil, con sus cifras, fechas y condiciones si la línea las trae.
- Un aporte de una línea [R…] es una recomendación para el plan ("un contacto de ${n} arrienda parrillas"), nunca lo que a ese contacto le gusta o no puede comer.
- No inventes datos que no estén en una línea. No aportes lo que no le sirve a este plan: si nada sirve, deja la lista vacía. Mejor uno o dos aportes buenos que muchos.
- No repitas un aporte que ya está en la conversación.
- Cuando el orquestador liste algo abierto, busca en tus líneas si alguna lo resuelve y apórtala.

Cómo decidir:
- Una condición dura es algo sin lo cual ${n} no puede participar. Una blanda es una preferencia.
- accept: la propuesta le sirve a ${n} tal como está. adjust: le serviría con un cambio concreto, que escribes en "ajustes". block: rompe una condición dura.
- Si pediste un ajuste por una preferencia y la propuesta siguiente no lo tomó, acepta: el acuerdo vale más que una preferencia. Insiste solo por una condición dura.

Todo lo que escribes lo leen los demás participantes en un chat del teléfono: sé breve. La postura y el motivo, una frase de menos de 100 caracteres; cada aporte, menos de 140. En español y en tercera persona ("${n} prefiere…"). Sin datos de salud, de plata personal ni nombres de personas que no participan.`;
}

function renderLines(lines: AgentLine[]): string {
  return lines.map((l) => `[${l.ref}]${l.section ? ` (${l.section})` : ""} ${l.text}`).join("\n");
}

function memberSystem(turn: MemberTurn): Anthropic.TextBlockParam[] {
  const { context, me } = turn;
  const own = context.lines.filter((l) => l.origen === "propio");
  const network = context.lines.filter((l) => l.origen === "red");
  const byContact = new Map<number, AgentLine[]>();
  for (const line of network) byContact.set(line.contact!.number, [...(byContact.get(line.contact!.number) ?? []), line]);
  const n = first(me.displayName);
  return [
    {
      type: "text",
      text: `${memberRules(me.displayName)}

LÍNEAS DE ${n.toUpperCase()}
${own.length ? renderLines(own) : "(no hay)"}

SOLO PARA TI
${context.privateNotes.length ? context.privateNotes.map((note) => `- ${note}`).join("\n") : "(nada)"}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `LA RED DE ${n.toUpperCase()}
${byContact.size ? [...byContact].map(([number, lines]) => `Contacto ${number} de ${n}:\n${renderLines(lines)}`).join("\n\n") : "(sus contactos no tienen nada cargado)"}`,
      cache_control: { type: "ephemeral" },
    },
  ];
}

function memberMessage(turn: MemberTurn): string {
  const others = turn.members.filter((m) => m.personId !== turn.me.personId).map((m) => m.displayName);
  const owner = turn.members.find((m) => m.personId === turn.ownerId)?.displayName ?? "";
  const n = first(turn.me.displayName);
  const head = `EL PLAN
"${turn.intent}"
Lo propone ${turn.ownerId === turn.me.personId ? `${n}, a quien representas` : owner}. Participan también ${listOf(others)}.`;
  if (turn.proposal === null) {
    return `${head}

Es la ronda de apertura. Entrega la postura de ${n} en una frase, sus condiciones (si tiene) y los aportes de ${n} y de su red que sirvan para armar este plan.
"participa" es false solo si ${n} no puede ser parte de esto (no puede asistir, no está disponible): la postura dice entonces que no puede y, si sirve al plan, hasta cuándo. Aunque no participe, entrega igual los aportes de su red.`;
  }
  return `${head}

LA CONVERSACIÓN HASTA AHORA
${turn.transcript}

PROPUESTA DEL ORQUESTADOR (ronda ${turn.round} de ${turn.maxRounds})
${turn.proposal}

Responde por ${n}: di el motivo en una frase y después decide. Si algo de lo abierto se resuelve con una línea de ${n} o de su red, apórtala.`;
}

const ORCHESTRATOR_SYSTEM = `Eres el orquestador de un plan en Minga. Un grupo de personas quiere hacer algo junto y cada una tiene un Agente que la representa. Tú no representas a nadie: redactas el plan que mejor resuelve lo que dijeron todos.

En cada ronda lees la intención, las posturas, las condiciones, los aportes y las respuestas de los Agentes, y entregas una propuesta:
- "resumen": el plan en una sola frase de menos de 140 caracteres, concreta. Se lee en un teléfono.
- "decisiones": solo lo que hay que fijar (fecha, lugar, presupuesto, quiénes), a lo más 4; si algo no está definido, no lo pongas. El valor va corto, en menos de 60 caracteres y sin claves (M1); el porqué en una frase breve, que leen solo los Agentes.
- "pasos": qué hay que hacer ahora, cada uno con un responsable entre los participantes, escrito con su clave (M1, M2…).
- "abiertos": lo que todavía nadie sabe y hace falta para cerrar el plan. Escríbelo en frases completas y específicas ("Falta saber si la banquetería del lugar tiene cocina separada sin gluten"), porque con esas frases cada Agente busca en la red de su persona. No pongas palabras sueltas.
- "desacuerdos": vacío, salvo en la decisión final.

Reglas:
- Las condiciones duras se respetan. Las blandas se equilibran: que nadie cargue con todas las concesiones.
- Usa los aportes. Si un dato resuelve algo, intégralo en la decisión. Si viene de un contacto de alguien, el paso es que esa persona le pregunte a su contacto, y ella es la responsable.
- No inventes precios, fechas, lugares ni disponibilidad que nadie aportó: lo que falte va en "abiertos".
- De una ronda a otra cambia solo lo que piden los ajustes. No reabras lo que ya aceptaron.
- Cada texto en menos de 200 caracteres, en español. Sin datos de salud ni de plata personal: solo la condición que el plan tiene que cumplir.

Cuando se te pida la decisión final, no hubo consenso y decides tú. Entrega siempre un plan completo y ejecutable, aunque no deje contentos a todos. Si dos condiciones duras chocan, elige la opción que deja participar a más personas y que respeta lo que pidió quien propuso el plan, y anota en "desacuerdos" quién queda sin lo que pidió (con su clave) y qué pidió. En la decisión final, "abiertos" lleva solo lo que de verdad nadie pudo responder.`;

function orchestratorMessage(turn: OrchestratorTurn): string {
  const members = turn.members.map((m) => `${m.key} = ${m.displayName}${m.owner ? " (propone el plan)" : ""}`).join("\n");
  const task = turn.final
    ? `Se cumplieron las ${turn.maxRounds} rondas sin consenso. Entrega la decisión final.`
    : turn.previous
      ? `Es la ronda ${turn.round} de ${turn.maxRounds}. Entrega una propuesta nueva que tome los ajustes y los aportes de la última ronda.`
      : `Es la ronda ${turn.round} de ${turn.maxRounds}. Entrega la primera propuesta.`;
  return `EL PLAN
"${turn.intent}"

PARTICIPANTES
${members}

LA CONVERSACIÓN HASTA AHORA
${turn.transcript || "(nadie ha dicho nada)"}

${turn.previous ? `ÚLTIMA PROPUESTA\n${turn.previous}\n\n` : ""}${task}`;
}

const usage = (u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }) => ({
  tokensIn: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
  tokensOut: u.output_tokens,
});

export function createAnthropicAgents(options: { client?: Anthropic } = {}): Agents {
  const client = options.client ?? new Anthropic();

  async function member<T>(turn: MemberTurn, schema: z.ZodType<T>): Promise<Measured<T>> {
    const started = Date.now();
    const response = await client.messages.parse(
      {
        model: MEMBER_MODEL,
        max_tokens: 8000,
        output_config: { effort: "low", format: zodOutputFormat(schema) },
        system: memberSystem(turn),
        messages: [{ role: "user", content: memberMessage(turn) }],
      },
      { timeout: 60_000, maxRetries: 1 },
    );
    if (response.stop_reason !== "end_turn" || !response.parsed_output) throw new Error(`el agente de miembro se detuvo con ${response.stop_reason}`);
    return { output: response.parsed_output, meta: { model: response.model, ms: Date.now() - started, ...usage(response.usage) } };
  }

  return {
    open: (turn) => member(turn, OpeningSchema),
    respond: (turn) => member(turn, ResponseSchema),

    async propose(turn) {
      const started = Date.now();
      // If a safety classifier declines the request, the API retries it on another model instead
      // of leaving the plan without a proposal.
      const response = await client.beta.messages.parse(
        {
          model: ORCHESTRATOR_MODEL,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: turn.final ? "medium" : "low", format: zodOutputFormat(ProposalSchema) },
          system: [{ type: "text", text: ORCHESTRATOR_SYSTEM, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: orchestratorMessage(turn) }],
        },
        { timeout: 120_000, maxRetries: 1 },
      );
      if (response.stop_reason !== "end_turn" || !response.parsed_output) throw new Error(`el orquestador se detuvo con ${response.stop_reason}`);
      return { output: response.parsed_output, meta: { model: response.model, ms: Date.now() - started, ...usage(response.usage) } };
    },
  };
}
