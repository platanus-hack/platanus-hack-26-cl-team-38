import { config } from "dotenv";
import seed from "../seed/rooms.json" with { type: "json" };
import { embed } from "@/lib/embeddings";
import { createAnthropicAgents } from "@/lib/plans/agents";
import { deliberate, type Agents } from "@/lib/plans/deliberate";
import { createPlan, loadPlan, neighbourhood, saveContext } from "@/lib/plans/store";
import { describePlan, transcript } from "@/lib/plans/view";
import { PublicProjectionSchema, type PublicProjection } from "@/lib/types";
import { runConnectionAction } from "@/lib/users/connections";
import { saveProfile } from "@/lib/users/profile";
import { createTestDb } from "@/lib/users/test-db";
import { connectionGraph, contextOf, network } from "../seed/network";

// Runs the three cases of seed/network.v2.json through the real agents, on a Postgres inside this
// process: the organizer plans with three of their connections, and the report says how many
// rounds it took, what it cost and which of the seed's `helpers` an agent brought from its network.
//   pnpm plan:eval            the three cases
//   pnpm plan:eval viaje      only that one (matrimonio | viaje | arriendo)

config({ path: process.env.ENV_FILE ?? ".env.local" });
if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN)
  throw new Error("Falta ANTHROPIC_API_KEY en .env.local");

// Per million tokens, standard rates.
const PRICE: Record<string, [number, number]> = { "claude-haiku-5-5": [0.1, 0.5], "claude-sonnet-5-5": [2, 10] };

const { db, pg } = await createTestDb();

const profiles = new Map<string, PublicProjection>();
for (const room of seed.rooms) {
  for (const raw of room.projections) {
    const projection = PublicProjectionSchema.parse(raw);
    const known = profiles.get(projection.personId)?.topics ?? [];
    profiles.set(projection.personId, {
      ...projection,
      topics: [...known, ...projection.topics.filter((t) => !known.some((k) => k.id === t.id))],
    });
  }
}
for (const profile of profiles.values()) await saveProfile(db, profile);
for (const { a, b, origin } of network.connections) {
  await runConnectionAction(db, { personId: a, otherId: b, action: "propose", origin });
  await runConnectionAction(db, { personId: b, otherId: a, action: "accept" });
}
for (const person of network.people) {
  for (const [scope, lines] of Object.entries(contextOf(person)) as [
    "red" | "propio",
    { section: string; text: string }[],
  ][]) {
    const vectors = await embed(lines.map((line) => line.text));
    await saveContext(
      db,
      person.personId,
      scope,
      "seed",
      lines.map((line, i) => ({ lineId: `seed-${scope}-${i + 1}`, ...line, embedding: vectors[i] })),
    );
  }
}

const graph = connectionGraph();
const real = createAnthropicAgents();
const only = process.argv[2];

for (const purpose of network.purposes.filter((p) => !only || p.type === only)) {
  const owner = purpose.organizers[0];
  const room = new Set(purpose.roles.map((r) => r.personId));
  // Whoever of the room the organizer knows directly, those with more contacts outside first.
  const others = [...(graph.get(owner) ?? [])]
    .filter((id) => room.has(id) && id !== owner)
    .sort(
      (a, b) =>
        [...graph.get(b)!].filter((id) => !room.has(id)).length -
          [...graph.get(a)!].filter((id) => !room.has(id)).length || a.localeCompare(b),
    )
    .slice(0, 3);
  const planId = `eval-${purpose.type}`;
  if (!(await createPlan(db, { id: planId, ownerId: owner, intent: purpose.summary, others, restrictions: [] })))
    throw new Error(`no se pudo crear el plan de ${purpose.type}`);

  const calls: { model: string; ms: number; tokensIn: number; tokensOut: number }[] = [];
  const measure = <T extends { meta: { model?: string; ms?: number; tokensIn?: number; tokensOut?: number } }>(
    result: T,
  ): T => {
    calls.push({
      model: result.meta.model ?? "",
      ms: result.meta.ms ?? 0,
      tokensIn: result.meta.tokensIn ?? 0,
      tokensOut: result.meta.tokensOut ?? 0,
    });
    return result;
  };
  const agents: Agents = {
    open: async (turn) => measure(await real.open(turn)),
    respond: async (turn) => measure(await real.respond(turn)),
    propose: async (turn) => measure(await real.propose(turn)),
  };

  const started = Date.now();
  const outcome = await deliberate(planId, { db, agents, embed });
  const seconds = (Date.now() - started) / 1000;
  const plan = (await loadPlan(db, planId))!;
  const names = new Map(plan.members.map((m) => [m.personId, m.displayName]));

  const reachable = new Set<string>();
  for (const member of plan.members)
    for (const contact of await neighbourhood(db, planId, member.personId)) reachable.add(contact.contactId);
  const helpers = purpose.helpers.map((h) => h.personId);
  const cited = new Set(
    plan.messages.flatMap(({ message }) =>
      message.agent === "miembro" ? message.content.aportes.flatMap((a) => (a.contactId ? [a.contactId] : [])) : [],
    ),
  );
  const discarded = plan.messages.flatMap(({ message }) =>
    message.agent === "verificador" ? [`${message.content.descartado}:${message.content.razon}`] : [],
  );
  const cost = calls.reduce((sum, c) => {
    const [input, output] = Object.entries(PRICE).find(([model]) => c.model.startsWith(model))?.[1] ?? [0, 0];
    return sum + (c.tokensIn * input + c.tokensOut * output) / 1_000_000;
  }, 0);

  console.log(`\n${"=".repeat(100)}\n${purpose.title}\n${"=".repeat(100)}`);
  console.log(`Participan: ${plan.members.map((m) => m.displayName).join(", ")}`);
  console.log(`\n${transcript(plan)}`);
  const final = plan.versions.find((v) => v.decidedBy)!;
  console.log(`\n--- PLAN (${final.decidedBy}, versión ${final.version}) ---\n${describePlan(final.content, names)}`);
  console.log(`\n--- MEDICIÓN ---`);
  console.log(
    `resultado: ${outcome?.status} · rondas: ${Math.min(plan.round, plan.maxRounds)} de ${plan.maxRounds} · ${seconds.toFixed(1)} s · ${calls.length} llamadas · US$ ${cost.toFixed(4)}`,
  );
  console.log(
    `tokens: ${calls.reduce((n, c) => n + c.tokensIn, 0)} de entrada, ${calls.reduce((n, c) => n + c.tokensOut, 0)} de salida`,
  );
  console.log(`llamada más lenta: ${Math.max(...calls.map((c) => c.ms))} ms`);
  console.log(
    `helpers del seed al alcance de un participante: ${helpers.filter((h) => reachable.has(h)).length} de ${helpers.length}`,
  );
  console.log(
    `helpers citados por un agente: ${helpers.filter((h) => cited.has(h)).length} (${
      helpers
        .filter((h) => cited.has(h))
        .map((h) => h.replace("seed-", ""))
        .join(", ") || "ninguno"
    })`,
  );
  console.log(
    `contactos citados que no eran helpers: ${
      [...cited]
        .filter((id) => !helpers.includes(id))
        .map((id) => id.replace("seed-", ""))
        .join(", ") || "ninguno"
    }`,
  );
  console.log(`descartado por el código: ${discarded.join(", ") || "nada"}`);
}

await pg.close();
