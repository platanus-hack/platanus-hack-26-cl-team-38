import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { EMBEDDING_DIM } from "@/lib/embeddings";
import type { Kind, PublicProjection } from "@/lib/types";
import { ConnectionRequestSchema, listConnections, runConnectionAction } from "./connections";
import { authenticate, matchUsers, saveProfile, type Db } from "./profile";
import { createTestDb } from "./test-db";

let pg: PGlite;
let db: Db;
beforeAll(async () => {
  ({ pg, db } = await createTestDb());
});

// A unit vector over a few axes: two topics match when they share enough of an axis.
function vec(parts: Record<number, number>): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  for (const [axis, weight] of Object.entries(parts)) v[Number(axis)] = weight;
  return v;
}

// Each test uses its own axes and names so that they cannot match each other's topics.
type T = [name: string, kind: Kind, depth: 1 | 2 | 3, embedding: number[]];
const person = (personId: string, displayName: string, topics: T[]): PublicProjection => ({
  personId,
  displayName,
  topics: topics.map(([name, kind, depth, embedding]) => ({ id: `${personId}.${name}`, name, kind, depth, sources: ["claude"], embedding })),
});

const count = async (sql: string, params: unknown[] = []) => Number((await pg.query<{ n: number }>(`select count(*) as n from ${sql}`, params)).rows[0].n);
const bearer = (key: string) => `Bearer ${key}`;
const KEY_A = "a".repeat(32);
const KEY_B = "b".repeat(32);

describe("perfil", () => {
  it("guarda un vector por nombre, lo publiquen cuantos lo publiquen, y los pares que calzan", async () => {
    await saveProfile(db, person("p1-ana", "Ana", [["cerámica", "sabe", 3, vec({ 0: 1 })], ["fintech", "hace", 2, vec({ 2: 1 })]]));
    await saveProfile(db, person("p1-beto", "Beto", [["Ceramica", "busca", 1, vec({ 0: 1 })], ["alfarería", "hace", 2, vec({ 0: 0.8, 1: 0.6 })]]));

    expect(await count("topic_vectors where name_key in ('ceramica', 'fintech', 'alfareria')")).toBe(3);
    expect(await count("user_topics where user_id like 'p1-%'")).toBe(4);
    const matches = await pg.query("select name_a, name_b, cosine from topic_matches where name_a in ('ceramica', 'fintech', 'alfareria') order by 1, 2");
    expect(matches.rows).toEqual([
      { name_a: "alfareria", name_b: "alfareria", cosine: 1 },
      { name_a: "alfareria", name_b: "ceramica", cosine: expect.closeTo(0.8) },
      { name_a: "ceramica", name_b: "alfareria", cosine: expect.closeTo(0.8) },
      { name_a: "ceramica", name_b: "ceramica", cosine: 1 },
      { name_a: "fintech", name_b: "fintech", cosine: 1 },
    ]);
  });

  it("compara entre sí los nombres nuevos que llegan en el mismo perfil", async () => {
    await saveProfile(db, person("p2-carla", "Carla", [["yoga", "hace", 2, vec({ 10: 1 })], ["pilates", "hace", 2, vec({ 10: 0.8, 11: 0.6 })]]));
    expect(await count("topic_matches where name_a = 'yoga' and name_b = 'pilates'")).toBe(1);
  });

  it("no reescribe nada si lo publicado no cambió", async () => {
    const dana = (depth: 1 | 2 | 3) => person("p3-dana", "Dana", [["apicultura", "sabe", depth, vec({ 20: 1 })]]);
    expect(await saveProfile(db, dana(2))).toBe(true);
    const written = (await pg.query("select xmin from user_topics where user_id = 'p3-dana'")).rows;
    expect(await saveProfile(db, dana(2))).toBe(false);
    expect((await pg.query("select xmin from user_topics where user_id = 'p3-dana'")).rows).toEqual(written);
    expect(await saveProfile(db, dana(3))).toBe(true);
  });
});

describe("cruce", () => {
  beforeAll(async () => {
    await saveProfile(db, person("x-ana", "Ana", [["escalada", "sabe", 3, vec({ 30: 1 })], ["cocina", "hace", 1, vec({ 32: 1 })]]));
    await saveProfile(db, person("x-beto", "Beto", [["escalada", "busca", 1, vec({ 30: 1 })], ["trekking", "hace", 2, vec({ 30: 0.8, 31: 0.6 })]]));
    await saveProfile(db, person("x-caro", "Caro", [["ajedrez", "sabe", 3, vec({ 33: 1 })]]));
  });

  it("dice qué comparten, por nombre idéntico y por significado, visto desde quien pregunta y sin vectores", async () => {
    const matches = await matchUsers(db, "x-ana", ["x-beto", "x-caro"]);
    expect(matches).toEqual([
      {
        personId: "x-beto",
        displayName: "Beto",
        shared: [
          { mine: { name: "escalada", kind: "sabe", depth: 3 }, theirs: { name: "escalada", kind: "busca", depth: 1 }, cosine: 1 },
          { mine: { name: "escalada", kind: "sabe", depth: 3 }, theirs: { name: "trekking", kind: "hace", depth: 2 }, cosine: 0.8 },
        ],
      },
    ]);
    expect(JSON.stringify(matches)).not.toContain("embedding");

    const [fromBeto] = await matchUsers(db, "x-beto", ["x-ana"]);
    expect(fromBeto.personId).toBe("x-ana");
    expect(fromBeto.shared[0]).toEqual({ mine: { name: "escalada", kind: "busca", depth: 1 }, theirs: { name: "escalada", kind: "sabe", depth: 3 }, cosine: 1 });
    expect(await matchUsers(db, "x-caro", ["x-ana", "x-beto"])).toEqual([]);
  });

  it("no guarda el resultado: siempre responde con lo que cada persona publica en ese momento", async () => {
    expect(await matchUsers(db, "x-ana", ["x-beto"])).toHaveLength(1);
    await saveProfile(db, person("x-beto", "Beto", [["trompeta", "hace", 2, vec({ 34: 1 })]]));
    expect(await matchUsers(db, "x-ana", ["x-beto"])).toEqual([]);
  });
});

describe("clave del dispositivo", () => {
  it("la primera clave que llega queda como la de esa persona, y otra no entra", async () => {
    await saveProfile(db, person("k-ana", "Ana", []));
    expect(await authenticate(db, "k-ana", bearer(KEY_A))).toBe("k-ana");
    expect(await authenticate(db, "k-ana", bearer(KEY_A))).toBe("k-ana");
    expect(await authenticate(db, "k-ana", bearer(KEY_B))).toBeNull();
    expect((await pg.query("select key_hash from users where id = 'k-ana'")).rows[0]).not.toEqual({ key_hash: KEY_A });
  });

  it("no entra sin clave, con una clave corta ni quien no tiene perfil", async () => {
    expect(await authenticate(db, "k-ana", null)).toBeNull();
    expect(await authenticate(db, "k-ana", bearer("corta"))).toBeNull();
    expect(await authenticate(db, "k-nadie", bearer(KEY_A))).toBeNull();
  });

  it("el check-in con clave la deja tomada desde el primer momento", async () => {
    await saveProfile(db, person("k-beto", "Beto", []), KEY_B);
    expect(await authenticate(db, "k-beto", bearer(KEY_A))).toBeNull();
    expect(await authenticate(db, "k-beto", bearer(KEY_B))).toBe("k-beto");
  });
});

describe("conexiones", () => {
  const act = (personId: string, otherId: string, action: "propose" | "accept" | "close", origin: object = { place: "MUT, Las Condes" }) =>
    runConnectionAction(db, ConnectionRequestSchema.parse({ personId, otherId, action, ...(action === "propose" ? { origin } : {}) }));
  const pair = (a: string, b: string) => count("connections where user_a = least($1, $2) and user_b = greatest($1, $2)", [a, b]);

  beforeAll(async () => {
    await saveProfile(db, person("c-ana", "Ana", [["vela", "sabe", 3, vec({ 40: 1 })]]));
    await saveProfile(db, person("c-beto", "Beto", [["vela", "busca", 1, vec({ 40: 1 })]]));
    await saveProfile(db, person("c-caro", "Caro", [["vela", "hace", 2, vec({ 40: 1 })]]));
    await saveProfile(db, person("c-dani", "Dani", []));
    await pg.query("insert into rooms (id, code, name) values ('c-sala', 'CSALA', 'Sala de prueba')");
    await pg.query("insert into rooms (id, code, name) values ('c-sala-mesa', 'CMESA', 'Sala de la mesa')");
    await pg.query(
      "insert into mesas (id, room_id, anchor_theme_id, members, score) values ('c-mesa', 'c-sala-mesa', 'tema-vela', $1, 1)",
      [JSON.stringify(["c-beto", "c-caro", "c-dani"].map((personId) => ({ personId, role: "comparte", themeId: "tema-vela", topicId: `${personId}.vela` })))],
    );
  });

  it("queda aceptada solo cuando aceptan los dos, con quién aceptó y cuándo", async () => {
    const proposed = await act("c-ana", "c-beto", "propose");
    expect(proposed).toMatchObject({
      status: 200,
      connection: { personId: "c-beto", displayName: "Beto", status: "propuesta", proposedByMe: true, acceptedAt: { mine: expect.any(String), theirs: null }, shared: [] },
    });
    // Proposing again, or accepting your own proposal, does not accept it for the other.
    expect(await act("c-ana", "c-beto", "propose")).toMatchObject({ connection: { status: "propuesta" } });
    expect(await act("c-ana", "c-beto", "accept")).toMatchObject({ status: 409 });
    expect(await listConnections(db, "c-beto")).toMatchObject([{ personId: "c-ana", status: "propuesta", proposedByMe: false, acceptedAt: { mine: null } }]);

    const accepted = await act("c-beto", "c-ana", "accept");
    expect(accepted).toMatchObject({
      status: 200,
      connection: {
        personId: "c-ana",
        status: "aceptada",
        proposedByMe: false,
        acceptedAt: { mine: expect.any(String), theirs: expect.any(String) },
        shared: [{ mine: { name: "vela", kind: "busca", depth: 1 }, theirs: { name: "vela", kind: "sabe", depth: 3 }, cosine: 1 }],
      },
    });
    expect(JSON.stringify(await pg.query("select * from connections"))).not.toContain("embedding");
  });

  it("la base no deja escribir el estado ni una propuesta sin la aceptación de quien propone", async () => {
    await expect(pg.query("update connections set status = 'aceptada'")).rejects.toThrow();
    await expect(
      pg.query("insert into connections (user_a, user_b, proposed_by, origin_kind, origin_label) values ('c-ana', 'c-dani', 'c-ana', 'lugar', 'x')"),
    ).rejects.toThrow(/check/);
  });

  it("hay una sola fila por pareja, proponga quien proponga", async () => {
    await act("c-ana", "c-caro", "propose");
    // Caro proposing back is Caro accepting: same row.
    expect(await act("c-caro", "c-ana", "propose")).toMatchObject({ connection: { status: "aceptada", proposedByMe: false } });
    expect(await pair("c-ana", "c-caro")).toBe(1);
    await expect(
      pg.query("insert into connections (user_a, user_b, proposed_by, accepted_a, origin_kind, origin_label) values ('c-caro', 'c-ana', 'c-caro', now(), 'lugar', 'x')"),
    ).rejects.toThrow(/check/);
  });

  it("solo la leen y la cambian sus dos partes", async () => {
    expect(await pair("c-ana", "c-beto")).toBe(1);
    expect(await listConnections(db, "c-dani")).toEqual([]);
    // Dani can only name pairs Dani is in: this is Dani↔Ana, which does not exist.
    expect(await act("c-dani", "c-ana", "accept")).toMatchObject({ status: 409 });
    expect(await act("c-dani", "c-ana", "close")).toMatchObject({ status: 404 });
    expect(await pair("c-ana", "c-beto")).toBe(1);
    expect((await listConnections(db, "c-ana")).map((c) => c.personId).sort()).toEqual(["c-beto", "c-caro"]);
  });

  it("la clave publicable del teléfono no lee ninguna tabla nueva ni ejecuta sus funciones", async () => {
    await pg.exec("set role anon");
    try {
      for (const table of ["users", "user_topics", "topic_vectors", "topic_matches", "connections", "logs"]) {
        expect(await count(table), table).toBe(0);
      }
      await expect(pg.query("insert into connections (user_a, user_b, proposed_by, accepted_a, origin_kind, origin_label) values ('c-ana', 'c-dani', 'c-ana', now(), 'lugar', 'x')")).rejects.toThrow(/row-level security/);
      await expect(pg.query("select * from connections_of('c-ana')")).rejects.toThrow(/permission denied/);
      await expect(pg.query("select * from shared_topics('c-ana', array['c-beto'])")).rejects.toThrow(/permission denied/);
      await expect(pg.query("select write_log('motor', 'mesa_creada', '{}', 'c-ana')")).rejects.toThrow(/permission denied/);
      await expect(pg.query("select * from logs_of('c-ana')")).rejects.toThrow(/permission denied/);
      await expect(pg.query("select claim_key('c-dani', 'x')")).rejects.toThrow(/permission denied/);
    } finally {
      await pg.exec("reset role");
    }
    expect(await count("connections")).toBeGreaterThan(0);
  });

  it("retirarse borra la fila con lo que tenían en común, y se puede volver a proponer", async () => {
    expect(await act("c-beto", "c-ana", "close")).toEqual({ status: 200, connection: null });
    expect(await pair("c-ana", "c-beto")).toBe(0);
    expect(await act("c-beto", "c-ana", "close")).toMatchObject({ status: 404 });
    expect(await act("c-beto", "c-ana", "propose")).toMatchObject({ connection: { status: "propuesta", proposedByMe: true, shared: [] } });
  });

  it("rechazar una propuesta también la borra", async () => {
    await act("c-dani", "c-beto", "propose");
    expect(await act("c-beto", "c-dani", "close")).toEqual({ status: 200, connection: null });
    expect(await listConnections(db, "c-dani")).toEqual([]);
  });

  it("guarda dónde nació: la sala, con su nombre aunque la sala se borre, o el lugar", async () => {
    expect(await act("c-dani", "c-caro", "propose", { roomId: "c-sala" })).toMatchObject({ connection: { origin: { kind: "sala", roomId: "c-sala", mesaId: null, label: "Sala de prueba" } } });
    await pg.query("delete from rooms where id = 'c-sala'");
    expect(await listConnections(db, "c-dani")).toMatchObject([{ origin: { kind: "sala", roomId: null, label: "Sala de prueba" } }]);
    expect((await listConnections(db, "c-ana")).find((c) => c.personId === "c-caro")?.origin).toEqual({ kind: "lugar", roomId: null, mesaId: null, label: "MUT, Las Condes" });
  });

  it("puede nacer en una mesa, solo entre dos de sus miembros, y sobrevive a la mesa con el nombre del tema", async () => {
    // Ana is not in the mesa.
    expect(await act("c-ana", "c-dani", "propose", { mesaId: "c-mesa" })).toMatchObject({ status: 404 });
    expect(await act("c-beto", "c-caro", "propose", { mesaId: "c-mesa" })).toMatchObject({
      connection: { origin: { kind: "mesa", roomId: "c-sala-mesa", mesaId: "c-mesa", label: "tema-vela" } },
    });
    // Deleting the room takes its mesas with it; the connection stays.
    await pg.query("delete from rooms where id = 'c-sala-mesa'");
    expect((await listConnections(db, "c-beto")).find((c) => c.personId === "c-caro")?.origin).toEqual({ kind: "mesa", roomId: null, mesaId: null, label: "tema-vela" });
  });

  it("no acepta una propuesta sin origen, con un dato de contacto en el lugar, a una sala o persona que no existe, ni a uno mismo", async () => {
    const propose = (otherId: string, origin?: object) => runConnectionAction(db, { personId: "c-dani", otherId, action: "propose", ...(origin ? { origin } : {}) } as never);
    expect(await propose("c-ana")).toMatchObject({ status: 400 });
    expect(await propose("c-ana", { place: "escríbeme a dani@correo.cl" })).toMatchObject({ status: 400 });
    expect(await propose("c-ana", { roomId: "no-existe" })).toMatchObject({ status: 404 });
    expect(await propose("c-nadie", { place: "MUT" })).toMatchObject({ status: 404 });
    expect(await propose("c-dani", { place: "MUT" })).toMatchObject({ status: 400 });
    expect(await pair("c-dani", "c-ana")).toBe(0);
  });
});
