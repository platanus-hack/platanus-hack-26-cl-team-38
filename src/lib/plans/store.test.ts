import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { runConnectionAction } from "@/lib/users/connections";
import { saveProfile, type Db } from "@/lib/users/profile";
import { createContextBuilder, NETWORK_BUDGET } from "./context";
import { profileLines } from "./profile-context";
import { createPlan, loadPlan, neighbourhood, networkContext, planGraph, saveContext } from "./store";
import { connect, createPlanNetwork, embed, lines, person } from "./test-fixture";

let pg: PGlite;
let db: Db;
let newPlan: Awaited<ReturnType<typeof createPlanNetwork>>["newPlan"];
beforeAll(async () => {
  ({ pg, db, newPlan } = await createPlanNetwork());
});

describe("plan y vecindario", () => {
  it("solo se arma con conexiones aceptadas de quien lo crea", async () => {
    expect(
      await createPlan(db, { id: "plan-x", ownerId: "yo", intent: "algo", others: ["ana", "hugo"], restrictions: [] }),
    ).toBe(false);
    expect(await createPlan(db, { id: "plan-x", ownerId: "yo", intent: "algo", others: [], restrictions: [] })).toBe(
      false,
    );
    expect(await loadPlan(db, "plan-x")).toBeNull();

    const plan = (await loadPlan(db, await newPlan()))!;
    expect(plan.members.map((m) => m.personId)).toEqual(["yo", "ana", "beto", "carla"]);
    expect(plan.members.map((m) => m.restrictions)).toEqual([["Solo fines de semana"], [], [], []]);
    expect(plan).toMatchObject({ status: "deliberando", round: 0, maxRounds: 5 });
  });

  it("el vecindario de cada participante son sus conexiones fuera del plan, a un paso", async () => {
    const id = await newPlan();
    const of = async (member: string) => (await neighbourhood(db, id, member)).map((c) => c.contactId);
    expect(await of("yo")).toEqual(["gabi"]);
    expect(await of("ana")).toEqual(["dario", "elisa"]);
    expect(await of("beto")).toEqual([]);
    // Darío is in two neighbourhoods; Hugo, three steps from the owner, is in none.
    expect(await of("carla")).toEqual(["dario", "fabi"]);
  });

  it("el grafo llega a tres niveles: yo, mis conexiones y las de ellas", async () => {
    expect((await planGraph(db, "yo")).connections).toEqual([
      { personId: "ana", displayName: "Ana Rojas", contacts: 2 },
      { personId: "beto", displayName: "Beto Lagos", contacts: 0 },
      { personId: "carla", displayName: "Carla Soto", contacts: 2 },
      { personId: "gabi", displayName: "Gabriela Ríos", contacts: 0 },
    ]);
  });

  it("de la red se leen los tópicos públicos y el perfil, nunca lo que es solo del agente de esa persona", async () => {
    const all = await networkContext(db, ["dario", "elisa"], null, 50);
    expect(all.map((l) => l.text).sort()).toEqual([
      "Como vegetariano.",
      "Hago tortas de novios sin gluten y sin azúcar",
      "La terraza de la viña recibe 180 personas",
      "eventos en viña",
      "tortas sin gluten",
    ]);
    const best = await networkContext(db, ["dario", "elisa"], await embed(["Falta una torta sin gluten"]), 2);
    expect(best.map((l) => l.userId)).toEqual(["elisa", "elisa"]);
    expect(best[0].score).toBeCloseTo(1);
  });

  it("un vecindario que no cabe se recorta con lo que el plan tiene abierto", async () => {
    await saveProfile(db, person("zoe", "Zoe Lira", ["tejido"]));
    await connect(db, "beto", "zoe");
    const many = Array.from({ length: NETWORK_BUDGET + 20 }, (_, i) => `Línea de relleno número ${i}`);
    await saveContext(db, "zoe", "red", "claude", lines([...many, "Manejo un bus para 40 personas"]));
    const id = await newPlan();
    const plan = (await loadPlan(db, id))!;
    const asked: string[][] = [];
    const build = createContextBuilder(plan, { db, embed: async (texts) => (asked.push(texts), embed(texts)) });
    const context = await build(
      plan.members.find((m) => m.personId === "beto")!,
      ["Falta un bus para llevar a los invitados"],
    );
    const network = context.lines.filter((l) => l.origen === "red");
    expect(network).toHaveLength(NETWORK_BUDGET);
    expect(network.map((l) => l.text)).toContain("Manejo un bus para 40 personas");
    expect(asked).toEqual([[plan.intent, "Falta un bus para llevar a los invitados"]]);
    await runConnectionAction(db, { personId: "beto", otherId: "zoe", action: "close" });
  });

  it("la clave publicable no lee planes ni contexto", async () => {
    const id = await newPlan();
    await pg.exec("set role anon");
    try {
      for (const table of ["plans", "plan_members", "plan_versions", "plan_messages", "user_context"]) {
        expect((await pg.query(`select * from ${table}`)).rows).toEqual([]);
      }
      await expect(pg.query("select plan_snapshot($1)", [id])).rejects.toThrow(/permission denied/);
      await expect(pg.query("select * from own_context('ana')")).rejects.toThrow(/permission denied/);
    } finally {
      await pg.exec("reset role");
    }
  });
});

describe("perfil como contexto", () => {
  it("cada viñeta es una línea, con la sección en que estaba", () => {
    expect(profileLines("## Viajes\n- Prefiero **hostales**\n- Ya conozco Perú\n\n## Comida\n1. Como de todo")).toEqual(
      [
        { section: "Viajes", text: "Prefiero hostales" },
        { section: "Viajes", text: "Ya conozco Perú" },
        { section: "Comida", text: "Como de todo" },
      ],
    );
  });
});
