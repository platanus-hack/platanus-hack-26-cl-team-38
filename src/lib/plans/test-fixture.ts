import type { PGlite } from "@electric-sql/pglite";
import { EMBEDDING_DIM } from "@/lib/embeddings";
import type { PublicProjection } from "@/lib/types";
import { runConnectionAction } from "@/lib/users/connections";
import { saveProfile, type Db } from "@/lib/users/profile";
import { createTestDb } from "@/lib/users/test-db";
import { createPlan, saveContext } from "./store";

// The small network every plan test runs on, in a Postgres inside the test process.
//   yo ── ana ── dario, elisa        dario also knows carla, and hugo (three steps from yo)
//    ├── beto
//    ├── carla ── dario, fabi
//    └── gabi (not invited)

const AXES = ["gluten", "viña", "bus", "pesca"];
// One axis per keyword, so a query about gluten is closest to the lines that mention it.
export function vec(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  const axis = AXES.findIndex((word) => text.toLowerCase().includes(word));
  v[axis < 0 ? 100 + (text.length % 50) : axis] = 1;
  return v;
}
export const embed = async (texts: string[]) => texts.map(vec);

export const person = (personId: string, displayName: string, topics: string[]): PublicProjection => ({
  personId,
  displayName,
  topics: topics.map((name) => ({ id: `${personId}.${name}`, name, kind: "sabe", depth: 2, sources: ["claude"], embedding: vec(name) })),
});

export const lines = (texts: string[], prefix = "l") => texts.map((text, i) => ({ lineId: `${prefix}${i + 1}`, section: "Oficio", text, embedding: vec(text) }));

export async function connect(db: Db, a: string, b: string) {
  await runConnectionAction(db, { personId: a, otherId: b, action: "propose", origin: { place: "test" } });
  await runConnectionAction(db, { personId: b, otherId: a, action: "accept" });
}

export async function createPlanNetwork(): Promise<{ pg: PGlite; db: Db; newPlan: (others?: string[], restrictions?: string[]) => Promise<string> }> {
  const { pg, db } = await createTestDb();
  const people: [string, string, string[]][] = [
    ["yo", "Oscar Pérez", ["pagos"]],
    ["ana", "Ana Rojas", ["diseño"]],
    ["beto", "Beto Lagos", ["cocina"]],
    ["carla", "Carla Soto", ["fotografía"]],
    ["dario", "Darío Núñez", ["eventos en viña"]],
    ["elisa", "Elisa Mora", ["tortas sin gluten"]],
    ["fabi", "Fabiola Paz", ["bus de turismo"]],
    ["gabi", "Gabriela Ríos", ["pesca con mosca"]],
    ["hugo", "Hugo Vera", ["banquetería sin gluten"]],
  ];
  for (const [id, name, topics] of people) await saveProfile(db, person(id, name, topics));
  for (const [a, b] of [["yo", "ana"], ["yo", "beto"], ["yo", "carla"], ["yo", "gabi"], ["ana", "dario"], ["ana", "elisa"], ["carla", "dario"], ["carla", "fabi"], ["dario", "hugo"]]) await connect(db, a, b);
  await saveContext(db, "dario", "red", "claude", lines(["La terraza de la viña recibe 180 personas"]));
  await saveContext(db, "elisa", "red", "claude", lines(["Hago tortas de novios sin gluten y sin azúcar"]));
  await saveContext(db, "elisa", "propio", "seed", lines(["No puedo trabajar los domingos"], "s"));
  await saveContext(db, "ana", "propio", "seed", lines(["No puedo viajar a más de una hora"], "s"));

  let count = 0;
  async function newPlan(others = ["ana", "beto", "carla"], restrictions = ["Solo fines de semana"]) {
    const id = `plan-${++count}`;
    if (!(await createPlan(db, { id, ownerId: "yo", intent: "Celebrar los 30 de Oscar en una viña", others, restrictions }))) throw new Error("no se pudo crear el plan de prueba");
    return id;
  }
  return { pg, db, newPlan };
}
