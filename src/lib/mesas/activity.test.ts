import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { saveProfile, type Db } from "@/lib/users/profile";
import { createTestDb } from "@/lib/users/test-db";
import { listLogs, recordDecision, writeLog } from "./activity";

let pg: PGlite;
let db: Db;

const members = (...ids: string[]) =>
  JSON.stringify(ids.map((personId) => ({ personId, role: "comparte", themeId: "tema", topicId: `${personId}.x` })));
const count = async (sql: string) =>
  Number((await pg.query<{ n: number }>(`select count(*) as n from ${sql}`)).rows[0].n);

beforeAll(async () => {
  ({ pg, db } = await createTestDb());
  for (const [id, name] of [
    ["m-ana", "Ana"],
    ["m-beto", "Beto"],
    ["m-caro", "Caro"],
  ])
    await saveProfile(db, { personId: id, displayName: name, topics: [] });
  await pg.query("insert into rooms (id, code, name) values ('m-sala', 'MSALA', 'Sala'), ('m-otra', 'MOTRA', 'Otra')");
  await pg.query(
    "insert into mesas (id, room_id, anchor_theme_id, members, score) values ('m-mesa', 'm-sala', 'tema', $1, 2)",
    [members("m-ana", "m-beto", "m-caro")],
  );
  await pg.query(
    "insert into mesas (id, room_id, anchor_theme_id, members, score) values ('m-mesa-2', 'm-otra', 'tema', $1, 1)",
    [members("m-beto", "m-caro", "m-dani")],
  );
});

describe("mesa", () => {
  it("encuentra las mesas de una persona por sus miembros", async () => {
    const mine = (id: string) =>
      pg.query("select id from mesas where members @> $1 order by id", [JSON.stringify([{ personId: id }])]);
    expect((await mine("m-ana")).rows).toEqual([{ id: "m-mesa" }]);
    expect((await mine("m-beto")).rows).toEqual([{ id: "m-mesa" }, { id: "m-mesa-2" }]);
  });
});

describe("decisiones principales", () => {
  it("quedan en la mesa, con la sala de la mesa y la referencia al log de la llamada que las produjo", async () => {
    const logId = await writeLog(db, {
      actor: "facilitador",
      event: "llamada",
      mesaId: "m-mesa",
      detail: { model: "claude-sonnet-5-5", ms: 4200, tokensIn: 900, tokensOut: 300, attempt: 1 },
    });
    expect(
      await recordDecision(
        db,
        "m-mesa",
        { agent: "facilitador", content: { round: 0, groupNodeId: "g-1" } },
        { logId },
      ),
    ).toMatchObject({ ok: true });

    const memberLog = await writeLog(db, {
      actor: "miembro",
      event: "llamada",
      userId: "m-ana",
      mesaId: "m-mesa",
      detail: { model: "claude-haiku-5-5", ms: 800 },
    });
    await recordDecision(
      db,
      "m-mesa",
      { agent: "miembro", personId: "m-ana", content: { decision: "accept", motivo: "Calza con lo que busca hoy" } },
      { logId: memberLog, personality: [] },
    );
    await recordDecision(db, "m-mesa", {
      agent: "verificador",
      content: { descartado: "rol", personId: "m-caro", razon: "kind_no_corresponde" },
    });

    const rows = (
      await pg.query(
        "select room_id, agent, person_id, content, log_id from deliberation_messages where mesa_id = 'm-mesa' order by id",
      )
    ).rows;
    expect(rows).toEqual([
      {
        room_id: "m-sala",
        agent: "facilitador",
        person_id: null,
        content: { round: 0, groupNodeId: "g-1" },
        log_id: logId,
      },
      {
        room_id: "m-sala",
        agent: "miembro",
        person_id: "m-ana",
        content: { decision: "accept", motivo: "Calza con lo que busca hoy" },
        log_id: memberLog,
      },
      {
        room_id: "m-sala",
        agent: "verificador",
        person_id: null,
        content: { descartado: "rol", personId: "m-caro", razon: "kind_no_corresponde" },
        log_id: null,
      },
    ]);
  });

  it("no guarda el motivo de un agente que nombra un tópico privado de su dueño o un tema sensible", async () => {
    const before = await count("deliberation_messages");
    const answer = (motivo: string, personality: string[]) =>
      recordDecision(
        db,
        "m-mesa",
        { agent: "miembro", personId: "m-beto", content: { decision: "reject", motivo } },
        { personality },
      );
    expect(await answer("Prefiere no ir por su búsqueda de trabajo", ["búsqueda de trabajo"])).toEqual({
      ok: false,
      reason: "privacidad",
    });
    expect(await answer("Hoy prefiere hablar de su depresión", [])).toEqual({ ok: false, reason: "privacidad" });
    expect(await count("deliberation_messages")).toBe(before);
    // Forgetting to say what is private is a bug, not a pass.
    await expect(
      recordDecision(db, "m-mesa", {
        agent: "miembro",
        personId: "m-beto",
        content: { decision: "reject", motivo: "x" },
      }),
    ).rejects.toThrow(/personality/);
  });

  it("rechaza lo que no es una decisión del contrato, y una mesa que no existe", async () => {
    await expect(
      recordDecision(db, "m-mesa", {
        agent: "facilitador",
        content: { round: 0, groupNodeId: "g", plan: "texto libre" },
      } as never),
    ).rejects.toThrow();
    await expect(
      recordDecision(
        db,
        "m-mesa",
        { agent: "miembro", personId: "m-ana", content: { decision: "accept", motivo: "x".repeat(141) } },
        { personality: [] },
      ),
    ).rejects.toThrow();
    expect(
      await recordDecision(db, "no-existe", {
        agent: "verificador",
        content: { descartado: "mesa", razon: "menos_de_tres" },
      }),
    ).toEqual({ ok: false, reason: "sin_mesa" });
  });
});

describe("logs", () => {
  it("cada persona lee solo los de su agente; los del facilitador no los lee nadie", async () => {
    await writeLog(db, { actor: "persona", event: "acepto", userId: "m-beto", mesaId: "m-mesa" });
    await writeLog(db, {
      actor: "miembro",
      event: "llamada",
      userId: "m-beto",
      mesaId: "m-mesa-2",
      detail: { ms: 500 },
    });

    expect((await listLogs(db, "m-ana")).map((l) => [l.actor, l.event, l.mesaId])).toEqual([
      ["miembro", "llamada", "m-mesa"],
    ]);
    expect((await listLogs(db, "m-beto")).map((l) => l.event).sort()).toEqual(["acepto", "llamada"]);
    expect((await listLogs(db, "m-beto", "m-mesa-2")).map((l) => l.detail)).toEqual([{ ms: 500 }]);
    expect(await listLogs(db, "m-caro")).toEqual([]);
    expect(await count("logs where user_id is null")).toBeGreaterThan(0);
  });

  it("la clave publicable del teléfono no lee ni escribe logs", async () => {
    expect(await count("logs")).toBeGreaterThan(0);
    await pg.exec("set role anon");
    try {
      expect(await count("logs")).toBe(0);
      await expect(
        pg.query("insert into logs (mesa_id, actor, event) values ('m-mesa', 'motor', 'mesa_creada')"),
      ).rejects.toThrow(/row-level security/);
    } finally {
      await pg.exec("reset role");
    }
  });

  it("no acepta el output de un agente de miembro, un log sin usuario ni mesa, ni campos fuera de la medición", async () => {
    await expect(
      writeLog(db, {
        actor: "miembro",
        event: "salida_invalida",
        userId: "m-ana",
        detail: { output: "quiere cambiarse de trabajo" },
      }),
    ).rejects.toThrow();
    await expect(writeLog(db, { actor: "motor", event: "mesa_creada" })).rejects.toThrow();
    await expect(
      writeLog(db, { actor: "miembro", event: "llamada", userId: "m-ana", detail: { prompt: "…" } as never }),
    ).rejects.toThrow();
    // The facilitator saw only public projections: what it wrote and was discarded can be kept.
    expect(
      await writeLog(db, {
        actor: "facilitador",
        event: "salida_invalida",
        mesaId: "m-mesa",
        detail: { output: { plan: "" } },
      }),
    ).toEqual(expect.any(Number));
  });

  it("la base tampoco deja pasar un detalle de más de 4 KB", async () => {
    await expect(
      pg.query("select write_log('motor', 'mesa_creada', $1, null, 'm-mesa')", [
        JSON.stringify({ x: "a".repeat(5000) }),
      ]),
    ).rejects.toThrow(/check/);
  });

  it("un log que no se puede escribir no detiene nada", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await writeLog(db, { actor: "persona", event: "acepto", userId: "m-sin-perfil" })).toBeNull();
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });

  it("vencen a los 7 días: dejan de leerse y se borran con el siguiente log", async () => {
    await pg.query("update logs set created_at = now() - interval '8 days' where user_id = 'm-ana'");
    expect(await listLogs(db, "m-ana")).toEqual([]);
    await writeLog(db, { actor: "motor", event: "mesa_creada", mesaId: "m-mesa" });
    expect(await count("logs where user_id = 'm-ana'")).toBe(0);
    // The decision outlives the log it pointed to.
    expect((await pg.query("select log_id from deliberation_messages where person_id = 'm-ana'")).rows).toEqual([
      { log_id: null },
    ]);
  });

  it("al borrar la sala se van la mesa, sus decisiones y sus logs", async () => {
    await pg.query("delete from rooms where id = 'm-sala'");
    expect(await count("mesas where id = 'm-mesa'")).toBe(0);
    expect(await count("deliberation_messages where mesa_id = 'm-mesa'")).toBe(0);
    expect(await count("logs where mesa_id = 'm-mesa'")).toBe(0);
    expect(await count("logs where mesa_id = 'm-mesa-2'")).toBe(1);
  });
});
