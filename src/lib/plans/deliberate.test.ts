import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/users/profile";
import { deliberate, type Agents, type MemberResponse, type MemberTurn, type OrchestratorPlan, type OrchestratorTurn } from "./deliberate";
import { claimPlan, listPlans, loadPlan } from "./store";
import { createPlanNetwork, embed } from "./test-fixture";
import { transcript, viewPlan } from "./view";

let pg: PGlite;
let db: Db;
let newPlan: Awaited<ReturnType<typeof createPlanNetwork>>["newPlan"];
beforeAll(async () => {
  ({ pg, db, newPlan } = await createPlanNetwork());
});

type Script = {
  respond?: (turn: MemberTurn) => MemberResponse;
  propose?: (turn: OrchestratorTurn) => OrchestratorPlan;
  open?: (turn: MemberTurn) => { cita: string; texto: string }[];
};

const proposal = (over: Partial<OrchestratorPlan> = {}): OrchestratorPlan => ({
  resumen: "Almuerzo en una viña el sábado",
  decisiones: [{ tema: "lugar", valor: "Viña en Casablanca", porque: "Cabe todo el grupo" }],
  pasos: [{ que: "Reservar la terraza", responsable: "M2" }],
  abiertos: ["Falta saber si hay torta sin gluten"],
  desacuerdos: [],
  ...over,
});
const accept: MemberResponse = { motivo: "Le sirve tal como está.", decision: "accept", ajustes: [], aportes: [] };

function fakeAgents(script: Script = {}) {
  const seen = { open: [] as MemberTurn[], respond: [] as MemberTurn[], propose: [] as OrchestratorTurn[] };
  const agents: Agents = {
    async open(turn) {
      seen.open.push(turn);
      return { output: { postura: `${turn.me.displayName} se suma.`, condiciones: [], aportes: script.open?.(turn) ?? [] }, meta: { model: "fake", ms: 1 } };
    },
    async respond(turn) {
      seen.respond.push(turn);
      return { output: script.respond?.(turn) ?? accept, meta: { model: "fake" } };
    },
    async propose(turn) {
      seen.propose.push(turn);
      return { output: script.propose?.(turn) ?? proposal(), meta: { model: "fake" } };
    },
  };
  return { agents, seen };
}

const kinds = (plan: Awaited<ReturnType<typeof loadPlan>>) => plan!.messages.map(({ round, message }) => `${round}:${message.agent}${"personId" in message && message.personId ? `:${message.personId}` : ""}`);

describe("deliberación", () => {
  it("cierra por consenso cuando los cuatro aceptan", async () => {
    const id = await newPlan();
    const { agents, seen } = fakeAgents();
    expect(await deliberate(id, { db, agents, embed })).toEqual({ status: "consenso", version: 1, decidedBy: "consenso" });

    const plan = (await loadPlan(db, id))!;
    expect(plan).toMatchObject({ status: "consenso", round: 1 });
    expect(plan.versions).toMatchObject([{ version: 1, decidedBy: "consenso", content: { pasos: [{ que: "Reservar la terraza", responsable: "ana" }] } }]);
    // Within a round the answers are stored as they arrive.
    expect(kinds(plan).slice(0, 4).sort()).toEqual(["0:miembro:ana", "0:miembro:beto", "0:miembro:carla", "0:miembro:yo"]);
    expect(kinds(plan)[4]).toBe("1:orquestador");
    expect(kinds(plan).slice(5).sort()).toEqual(["1:miembro:ana", "1:miembro:beto", "1:miembro:carla", "1:miembro:yo"]);
    expect(seen.propose).toHaveLength(1);
    expect(seen.propose[0].members).toEqual([
      { key: "M1", displayName: "Oscar Pérez", owner: true },
      { key: "M2", displayName: "Ana Rojas", owner: false },
      { key: "M3", displayName: "Beto Lagos", owner: false },
      { key: "M4", displayName: "Carla Soto", owner: false },
    ]);
    expect((await listPlans(db, "carla")).find((p) => p.id === id)).toMatchObject({ status: "consenso", resumen: "Almuerzo en una viña el sábado" });
    expect(await listPlans(db, "gabi")).toEqual([]);
  });

  it("cada agente lee lo suyo, lo privado solo de su persona, y de la red solo lo que recomienda", async () => {
    const id = await newPlan();
    const { agents, seen } = fakeAgents();
    await deliberate(id, { db, agents, embed });
    const of = (personId: string) => seen.open.find((t) => t.me.personId === personId)!.context;

    expect(of("yo").privateNotes).toEqual(["Solo fines de semana"]);
    expect(of("ana").privateNotes).toEqual(["Oficio: No puedo viajar a más de una hora"]);
    expect(of("beto").privateNotes).toEqual([]);
    expect(of("ana").lines.map((l) => `${l.ref} ${l.origen} ${l.contact?.number ?? "-"} ${l.text}`)).toEqual([
      "P1 propio - diseño",
      "R1 red 1 eventos en viña",
      "R2 red 1 La terraza de la viña recibe 180 personas",
      "R3 red 2 tortas sin gluten",
      "R4 red 2 Hago tortas de novios sin gluten y sin azúcar",
    ]);
    expect(of("yo").lines.filter((l) => l.origen === "red").map((l) => l.text)).toEqual(["pesca con mosca"]);
    // Elisa's own restriction is for Elisa's agent, not for Ana's; and her diet is a taste, not a recommendation.
    expect(JSON.stringify(seen.open)).not.toContain("domingos");
    expect(JSON.stringify(seen.open)).not.toContain("vegetariano");
  });

  it("al límite de cinco rondas decide el orquestador, y deja escrito quién quedó en desacuerdo", async () => {
    const id = await newPlan();
    const { agents, seen } = fakeAgents({
      respond: (turn) => (turn.me.personId === "beto" ? { motivo: "Prefiere otro día.", decision: "adjust", ajustes: [{ tema: "fecha", pide: "Que sea domingo" }], aportes: [] } : accept),
      propose: (turn) => proposal(turn.final ? { resumen: "Se hace el sábado", abiertos: [], desacuerdos: [{ miembro: "M3", tema: "fecha", detalle: "Pedía domingo" }, { miembro: "M9", tema: "x", detalle: "no existe" }] } : {}),
    });
    expect(await deliberate(id, { db, agents, embed })).toEqual({ status: "decidido", version: 6, decidedBy: "orquestador" });

    expect(seen.propose.map((t) => [t.round, t.final])).toEqual([[1, false], [2, false], [3, false], [4, false], [5, false], [5, true]]);
    expect(seen.respond).toHaveLength(20);
    const plan = (await loadPlan(db, id))!;
    expect(plan.status).toBe("decidido");
    expect(plan.versions.at(-1)).toMatchObject({ version: 6, decidedBy: "orquestador", content: { resumen: "Se hace el sábado", desacuerdos: [{ personId: "beto", tema: "fecha", detalle: "Pedía domingo" }] } });
    expect(plan.versions.slice(0, 5).every((v) => v.decidedBy === null && v.content.desacuerdos.length === 0)).toBe(true);
    expect(viewPlan(plan, "yo")).toMatchObject({ round: 5, maxRounds: 5, plan: { version: 6, decidedBy: "orquestador" } });
  });

  it("un aporte cita una línea que el agente leyó, y el contacto solo se le nombra a su conexión", async () => {
    const id = await newPlan();
    const { agents } = fakeAgents({
      open: (turn) =>
        turn.me.personId === "ana"
          ? [
              { cita: "[R4]", texto: "Un contacto de Ana hace tortas sin gluten y sin azúcar" },
              { cita: "R99", texto: "Un contacto de Ana tiene un salón para 500" },
              { cita: "R2", texto: "Darío Núñez dice que la terraza recibe 180 personas" },
              { cita: "P1", texto: "Ana puede diseñar las invitaciones" },
            ]
          : [],
    });
    await deliberate(id, { db, agents, embed });
    const plan = (await loadPlan(db, id))!;

    const ana = plan.messages.find(({ round, message }) => round === 0 && message.agent === "miembro" && message.personId === "ana")!.message;
    expect(ana.agent === "miembro" && ana.content.aportes).toEqual([
      { lineId: "l1", contactId: "elisa", texto: "Un contacto de Ana hace tortas sin gluten y sin azúcar", origen: "red" },
      { lineId: "ana.diseño", texto: "Ana puede diseñar las invitaciones", origen: "propio" },
    ]);
    const discarded = plan.messages.flatMap(({ message }) => (message.agent === "verificador" ? [`${message.personId}:${message.content.descartado}:${message.content.razon}`] : []));
    expect(discarded).toEqual(["ana:aporte:cita_inventada", "ana:aporte:nombra_contacto"]);

    const aportesFor = (reader: string) => viewPlan(plan, reader, new Map([["elisa", "Elisa Mora"]]))!.messages.find((m) => m.personId === "ana" && m.round === 0)!.aportes;
    // `fuente` numbers the contact for everyone (the network view lights it up); only Ana reads the name.
    expect(aportesFor("ana")[0]).toEqual({ texto: "Un contacto de Ana hace tortas sin gluten y sin azúcar", origen: "red", contacto: "Elisa Mora", fuente: 1 });
    expect(aportesFor("yo")[0]).toEqual({ texto: "Un contacto de Ana hace tortas sin gluten y sin azúcar", origen: "red", fuente: 1 });
    expect(aportesFor("yo")[1]).toEqual({ texto: "Ana puede diseñar las invitaciones", origen: "propio" });
    expect(transcript(plan)).toContain("aporta (de un contacto de Ana Rojas): Un contacto de Ana hace tortas");
    expect(transcript(plan)).not.toMatch(/Elisa|Darío/);
    expect(viewPlan(plan, "gabi")).toBeNull();
  });

  it("quien no puede ser parte lo dice en la apertura, y la vista cuenta los contactos de cada uno", async () => {
    const id = await newPlan();
    const { agents } = fakeAgents();
    const open = agents.open;
    agents.open = async (turn) => {
      const answer = await open(turn);
      return turn.me.personId === "beto" ? { ...answer, output: { ...answer.output, postura: "Beto no puede ir: está fuera hasta el domingo.", participa: false } } : { ...answer, output: { ...answer.output, participa: true } };
    };
    await deliberate(id, { db, agents, embed });
    const plan = (await loadPlan(db, id))!;

    const view = viewPlan(plan, "yo", new Map(), new Map([["ana", 2], ["carla", 2]]))!;
    const opening = (personId: string) => view.messages.find((m) => m.round === 0 && m.personId === personId)!;
    expect(opening("beto")).toMatchObject({ participa: false, text: "Beto no puede ir: está fuera hasta el domingo." });
    expect(opening("ana").participa).toBe(true);
    expect(view.messages.filter((m) => m.round > 0).every((m) => m.participa === undefined)).toBe(true);
    expect(view.members).toEqual([
      { personId: "yo", displayName: "Oscar Pérez", contacts: 0 },
      { personId: "ana", displayName: "Ana Rojas", contacts: 2 },
      { personId: "beto", displayName: "Beto Lagos", contacts: 0 },
      { personId: "carla", displayName: "Carla Soto", contacts: 2 },
    ]);
    expect(transcript(plan)).toContain("Agente de Beto Lagos [no participa]: Beto no puede ir");
  });

  it("lo que el léxico bloquea no llega a la conversación", async () => {
    const id = await newPlan();
    const { agents } = fakeAgents({
      respond: (turn) => (turn.round === 1 && turn.me.personId === "carla" ? { motivo: "Carla tiene diabetes y ese día tiene control", decision: "adjust", ajustes: [{ tema: "fecha", pide: "Que sea el domingo" }], aportes: [] } : accept),
    });
    await deliberate(id, { db, agents, embed });
    const plan = (await loadPlan(db, id))!;
    const carla = plan.messages.find(({ round, message }) => round === 1 && message.agent === "miembro" && message.personId === "carla")!.message;
    expect(carla.agent === "miembro" && carla.content).toMatchObject({ decision: "adjust", motivo: "Pide un cambio a la propuesta.", ajustes: [{ tema: "fecha", pide: "Que sea el domingo" }] });
    expect(JSON.stringify(viewPlan(plan, "yo"))).not.toContain("diabetes");
  });

  it("un agente que no responde es una abstención y no frena a los demás", async () => {
    const id = await newPlan();
    const { agents } = fakeAgents({
      respond: (turn) => {
        if (turn.me.personId === "beto") throw new Error("timeout");
        return accept;
      },
    });
    expect(await deliberate(id, { db, agents, embed })).toMatchObject({ status: "consenso", version: 1 });
    expect(kinds(await loadPlan(db, id))).toContain("1:verificador:beto");
  });

  it("bloquear es para quien declaró una condición dura", async () => {
    const id = await newPlan();
    const block: MemberResponse = { motivo: "No le sirve.", decision: "block", ajustes: [], aportes: [] };
    const { agents } = fakeAgents({ respond: (turn) => (turn.round === 1 && turn.me.personId === "beto" ? block : accept) });
    await deliberate(id, { db, agents, embed });
    const beto = (await loadPlan(db, id))!.messages.find(({ round, message }) => round === 1 && message.agent === "miembro" && message.personId === "beto")!.message;
    expect(beto.agent === "miembro" && beto.content).toMatchObject({ decision: "adjust" });
  });

  it("sin orquestador igual hay plan: lo cierra el código", async () => {
    const id = await newPlan();
    const { agents, seen } = fakeAgents({
      propose: () => {
        throw new Error("api caída");
      },
    });
    expect(await deliberate(id, { db, agents, embed })).toEqual({ status: "decidido", version: 1, decidedBy: "codigo" });
    expect(seen.propose).toHaveLength(2);
    const plan = (await loadPlan(db, id))!;
    expect(plan.versions).toMatchObject([{ decidedBy: "codigo", content: { resumen: "Celebrar los 30 de Oscar en una viña", pasos: [{ responsable: "yo" }] } }]);
    expect(viewPlan(plan, "yo")!.messages.at(-1)!.text).toMatch(/orquestador no respondió/);

    const later = await newPlan();
    let calls = 0;
    const flaky = fakeAgents({
      respond: () => ({ motivo: "Prefiere otra cosa.", decision: "adjust", ajustes: [], aportes: [] }),
      propose: () => {
        if (++calls > 2) throw new Error("api caída");
        return proposal();
      },
    });
    expect(await deliberate(later, { db, agents: flaky.agents, embed })).toEqual({ status: "decidido", version: 2, decidedBy: "codigo" });
  });

  it("retoma donde quedó si el proceso muere a mitad de camino", async () => {
    const id = await newPlan();
    let writes = 0;
    const dying: Db = {
      rpc(fn, args) {
        // Four openings, the proposal and the first answer got stored; then the process dies.
        if (fn === "record_plan_message" && ++writes >= 7) throw new Error("proceso muerto");
        return db.rpc(fn, args);
      },
    };
    await expect(deliberate(id, { db: dying, agents: fakeAgents().agents, embed })).rejects.toThrow("proceso muerto");
    expect((await loadPlan(db, id))!.status).toBe("deliberando");

    // The claim of the dead process is still fresh, so nobody else takes the plan yet.
    expect(await claimPlan(db, id)).toBe(false);
    await pg.query("update plans set claimed_at = now() - interval '10 minutes' where id = $1", [id]);
    expect(await claimPlan(db, id)).toBe(true);

    const { agents, seen } = fakeAgents();
    expect(await deliberate(id, { db, agents, embed })).toMatchObject({ status: "consenso", version: 1 });
    expect(seen.open).toHaveLength(0);
    expect(seen.propose).toHaveLength(0);
    expect(seen.respond).toHaveLength(3);
    expect(kinds(await loadPlan(db, id)).filter((k) => k.startsWith("1:miembro"))).toHaveLength(4);
    expect(await deliberate(id, { db, agents, embed })).toMatchObject({ status: "consenso", version: 1 });
  });
});
