import { describe, expect, it } from "vitest";
import type { Kind, PublicTopic } from "@/lib/types";
import { matchTopics } from "./matches";
import { networkInsights } from "./network-insights";
import type { Coincidence, Encounter } from "./people";

const NOW = Date.parse("2026-11-22T12:00:00.000Z");
const topic = (name: string, kind: Kind = "le_gusta"): PublicTopic => ({
  id: name,
  name,
  kind,
  depth: 1,
  sources: ["claude"],
});
const person = (id: string, topics: PublicTopic[], minutesAgo = 600): Encounter => ({
  person: { personId: id, displayName: `${id} Apellido`, topics },
  distanceM: 0,
  radiusM: 100,
  at: new Date(NOW - minutesAgo * 60_000).toISOString(),
  place: "HACK26",
  relation: "cercania",
});
const coin = (mine: PublicTopic[], e: Encounter): Coincidence => ({ ...e, ...matchTopics(mine, e.person.topics) });

describe("networkInsights", () => {
  const mine = [topic("python", "sabe"), topic("cerveza artesanal"), topic("rust", "busca")];
  const ana = person("Ana", [topic("python"), topic("cerveza artesanal"), topic("escalada")]);
  const bruno = person("Bruno", [topic("cerveza artesanal"), topic("rust", "sabe"), topic("escalada")], 5);
  const carla = person("Carla", [topic("escalada"), topic("python"), topic("cerveza artesanal")]);
  const near = [ana, bruno, carla];
  const coins = near.map((e) => coin(mine, e));
  const lines = networkInsights({ mine, coins, near, contactIds: new Set(["Ana"]), now: NOW });

  it("names the Interés most people share with you, by first name", () => {
    expect(lines[0]).toBe("Ana, Bruno, Carla y tú comparten Cerveza artesanal");
  });

  it("says who knows what you are looking for", () => {
    expect(lines).toContain("Bruno sabe de Rust, algo que tú buscas");
  });

  it("points at someone with a lot in common who is not your Contacto yet", () => {
    expect(lines).toContain("Bruno comparte 2 Intereses contigo y aún no es tu Contacto");
  });

  it("counts what is common nearby that you do not have", () => {
    expect(lines).toContain("3 personas cerca se interesan en Escalada");
  });

  it("tells who just arrived, only within the hour", () => {
    expect(lines).toContain("Bruno llegó hace 5 min");
    const later = networkInsights({ mine, coins, near, contactIds: new Set(), now: NOW + 2 * 3_600_000 });
    expect(later.some((l) => l.includes("llegó"))).toBe(false);
  });

  it("prints every line it found", () => {
    expect(lines).toMatchInlineSnapshot(`
      [
        "Ana, Bruno, Carla y tú comparten Cerveza artesanal",
        "Bruno sabe de Rust, algo que tú buscas",
        "Bruno comparte 2 Intereses contigo y aún no es tu Contacto",
        "3 personas cerca se interesan en Escalada",
        "Ana y Carla comparten 3 Intereses entre sí",
        "Bruno llegó hace 5 min",
        "Ana, Carla y tú comparten Python",
        "Con Bruno tienes más en común: 2 Intereses",
      ]
    `);
  });

  it("never repeats a line and keeps to eight", () => {
    expect(new Set(lines).size).toBe(lines.length);
    expect(lines.length).toBeLessThanOrEqual(8);
  });
});
