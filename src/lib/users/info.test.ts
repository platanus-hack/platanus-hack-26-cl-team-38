import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { seedUserInfo } from "../../../seed/user-info";
import { listConnections, runConnectionAction } from "./connections";
import { getUserInfo, readOwnInfo, saveOwnInfo, saveUserInfo } from "./info";
import { matchUsers, saveProfile, type Db } from "./profile";
import { createTestDb } from "./test-db";

let pg: PGlite;
let db: Db;

const bearer = (key: string) => `Bearer ${key}`;
const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
const info = { email: "ana@correo.cl", age: 31, gender: "Mujer", phone: "+56 9 1234 5678", occupation: "Arquitecta" } as const;
const count = async (sql: string) => Number((await pg.query<{ n: number }>(`select count(*) as n from ${sql}`)).rows[0].n);

beforeAll(async () => {
  ({ pg, db } = await createTestDb());
  await saveProfile(db, { personId: "i-ana", displayName: "Ana", topics: [] }, KEY_A);
  await saveProfile(db, { personId: "i-beto", displayName: "Beto", topics: [] }, KEY_B);
});

describe("información del perfil", () => {
  it("quien no llenó el formulario no tiene datos, y los usuarios que ya existían siguen igual", async () => {
    expect(await readOwnInfo(db, "i-ana", bearer(KEY_A))).toEqual({ status: 200, info: null });
    expect(await count("users where id in ('i-ana', 'i-beto')")).toBe(2);
    expect(await count("user_info")).toBe(0);
  });

  it("su dueña la guarda, la lee y la corrige; queda una sola fila", async () => {
    expect(await saveOwnInfo(db, { personId: "i-ana", info }, bearer(KEY_A))).toEqual({ status: 200, info });
    expect(await readOwnInfo(db, "i-ana", bearer(KEY_A))).toEqual({ status: 200, info });
    const later = { ...info, age: 32, occupation: "" };
    expect(await saveOwnInfo(db, { personId: "i-ana", info: later }, bearer(KEY_A))).toEqual({ status: 200, info: later });
    expect(await count("user_info where user_id = 'i-ana'")).toBe(1);
  });

  it("el oficio puede no venir", async () => {
    const without = { email: info.email, age: info.age, gender: info.gender, phone: info.phone };
    expect(await saveOwnInfo(db, { personId: "i-beto", info: without }, bearer(KEY_B))).toEqual({ status: 200, info: { ...without, occupation: "" } });
  });

  it("nadie más la lee ni la escribe: sin clave, con otra clave o con la clave propia y el id de otra persona", async () => {
    for (const authorization of [null, bearer("c".repeat(64)), bearer(KEY_B)]) {
      expect(await readOwnInfo(db, "i-ana", authorization)).toMatchObject({ status: 401 });
      expect(await saveOwnInfo(db, { personId: "i-ana", info: { ...info, email: "otro@correo.cl" } }, authorization)).toMatchObject({ status: 401 });
    }
    expect((await getUserInfo(db, "i-ana"))?.email).toBe("ana@correo.cl");
  });

  it("en un perfil del seed tampoco: otro dispositivo entra al perfil, pero no a su información", async () => {
    await saveProfile(db, { personId: "seed-i-ana", displayName: "Ana", topics: [] }, KEY_A);
    expect(await saveOwnInfo(db, { personId: "seed-i-ana", info }, bearer(KEY_A))).toMatchObject({ status: 200 });
    expect(await readOwnInfo(db, "seed-i-ana", bearer(KEY_B))).toMatchObject({ status: 401 });
    expect(await saveOwnInfo(db, { personId: "seed-i-ana", info: { ...info, email: "otro@correo.cl" } }, bearer(KEY_B))).toMatchObject({ status: 401 });
  });

  it("no sale en lo que recibe otra persona: ni en el cruce ni en las conexiones", async () => {
    await runConnectionAction(db, { personId: "i-ana", otherId: "i-beto", action: "propose", origin: { place: "MUT" } });
    const seen = JSON.stringify([await listConnections(db, "i-beto"), await matchUsers(db, "i-beto", ["i-ana"])]);
    expect(seen).toContain("Ana");
    for (const value of [info.email, info.phone, "Arquitecta", "Mujer"]) expect(seen).not.toContain(value);
  });

  it("la clave publicable del teléfono no la lee ni ejecuta sus funciones", async () => {
    expect(await count("user_info")).toBeGreaterThan(0);
    await pg.exec("set role anon");
    try {
      expect(await count("user_info")).toBe(0);
      await expect(pg.query("select * from user_info_of('i-ana')")).rejects.toThrow(/permission denied/);
      await expect(pg.query("select * from save_user_info('i-ana', 'x@y.cl', 30, 'Mujer', '12345678', '')")).rejects.toThrow(/permission denied/);
      await expect(pg.query("select ensure_user('i-nuevo', 'X', 'hash')")).rejects.toThrow(/permission denied/);
    } finally {
      await pg.exec("reset role");
    }
  });

  it("rechaza datos fuera del contrato, en la ruta y en la base", async () => {
    const bad = (patch: object) => saveOwnInfo(db, { personId: "i-ana", info: { ...info, ...patch } }, bearer(KEY_A));
    for (const patch of [{ email: "sin-arroba" }, { age: 12 }, { age: 30.5 }, { gender: "Otro" }, { phone: "llámame" }, { occupation: "x".repeat(61) }, { rut: "1-9" }]) {
      expect(await bad(patch), JSON.stringify(patch)).toMatchObject({ status: 400 });
    }
    await expect(pg.query("select * from save_user_info('i-ana', 'a@b.cl', 12, 'Mujer', '12345678', '')")).rejects.toThrow(/check/);
    await expect(pg.query("select * from save_user_info('i-ana', 'a@b.cl', 30, 'Otro', '12345678', '')")).rejects.toThrow(/check/);
    await expect(pg.query("select * from save_user_info('i-ana', 'a@b.cl', 30, 'Mujer', 'abc', '')")).rejects.toThrow(/check/);
  });

  it("se puede llenar antes del primer check-in: crea a la persona con su clave, sin tocar a quien ya existe", async () => {
    expect(await saveOwnInfo(db, { personId: "i-nueva", info }, bearer(KEY_A))).toMatchObject({ status: 401 });
    expect(await saveOwnInfo(db, { personId: "i-nueva", displayName: "Nueva", info }, bearer(KEY_A))).toEqual({ status: 200, info });
    expect(await readOwnInfo(db, "i-nueva", bearer(KEY_B))).toMatchObject({ status: 401 });
    // Naming someone who exists does not rename them nor hand over their profile.
    expect(await saveOwnInfo(db, { personId: "i-beto", displayName: "Impostor", info }, bearer(KEY_A))).toMatchObject({ status: 401 });
    expect((await pg.query("select display_name from users where id = 'i-beto'")).rows).toEqual([{ display_name: "Beto" }]);
    expect(await saveOwnInfo(db, { personId: "i-otra", displayName: "escríbeme a x@correo.cl", info }, bearer(KEY_A))).toMatchObject({ status: 400 });
  });

  it("el relleno del seed entra tal cual, y se va con la persona", async () => {
    const filler = seedUserInfo("i-beto");
    expect(await saveUserInfo(db, "i-beto", filler)).toEqual(filler);
    await pg.query("delete from users where id = 'i-beto'");
    expect(await count("user_info where user_id = 'i-beto'")).toBe(0);
  });
});
