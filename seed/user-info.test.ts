import { describe, expect, it } from "vitest";
import seed from "./rooms.json";
import { seedUserInfo } from "./user-info";

const ids = [...new Set(seed.rooms.flatMap((room) => room.projections.map((p) => p.personId)))];

describe("seedUserInfo", () => {
  it("le da a cada persona del seed datos válidos, falsos a la vista e iguales en cada corrida", () => {
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      // seedUserInfo() parses with UserInfoSchema: an invalid value would throw here.
      const info = seedUserInfo(id);
      expect(info).toEqual(seedUserInfo(id));
      expect(info.email).toMatch(/@example\.com$/);
      expect(info.phone).toMatch(/^\+56 9 0000 \d{4}$/);
      expect(info.gender).toBe("Prefiero no decir");
    }
  });

  it("usa la edad que el seed ya tiene para esa persona, si cabe en el formulario", () => {
    expect(seedUserInfo("seed-ana", 64).age).toBe(64);
    expect(seedUserInfo("seed-ana", 9).age).toBe(seedUserInfo("seed-ana").age);
  });
});
