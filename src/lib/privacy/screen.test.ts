import { describe, expect, it } from "vitest";
import { SEED_ROOMS } from "../../../seed/people";
import { PERSONAL, SAFE, SAFE_HARD, SENSITIVE_OBVIOUS } from "./eval-set";
import { screen, screenText } from "./screen";
import { fingerprint, strictest } from "./taxonomy";

describe("screen", () => {
  it.each(SENSITIVE_OBVIOUS.map((c) => [`${c.kind} · ${c.name}`, c] as const))("blocks %s", (_label, c) => {
    expect(screen(c)).toMatchObject({ level: "sensible", category: c.category });
  });

  it.each([...SAFE, ...SAFE_HARD, ...PERSONAL].map((c) => [`${c.kind} · ${c.name}`, c] as const))("does not block %s", (_label, c) => {
    expect(screen(c)).toBeNull();
  });

  it("does not block any topic of the seed", () => {
    const flagged = SEED_ROOMS.flatMap((r) => r.people.flatMap((p) => p.topics))
      .filter(([name, kind]) => screen({ kind, name }) !== null)
      .map(([name, kind]) => `${kind} · ${name}`);
    expect(flagged).toEqual([]);
  });

  it("reads the same subject as a confidence or as expertise depending on the kind", () => {
    expect(screen({ kind: "busca", name: "terapia cognitivo conductual" })?.category).toBe("salud");
    expect(screen({ kind: "sabe", name: "terapia cognitivo conductual" })).toBeNull();
    expect(screen({ kind: "sabe", name: "manejar mi ansiedad" })?.category).toBe("salud");
  });

  it("ignores accents and case", () => {
    expect(screen({ kind: "es", name: "CATÓLICO" })?.category).toBe("religion");
  });

  it("treats free text as lived, never as expertise", () => {
    expect(screenText("juntarse a hablar de su depresión")?.category).toBe("salud");
    expect(screenText("juntarse en el patio a hablar de escalada")).toBeNull();
  });
});

describe("taxonomy", () => {
  it("never lowers a level when verdicts are combined", () => {
    expect(strictest("segura", "sensible", "personal")).toBe("sensible");
    expect(strictest("personal", "segura")).toBe("personal");
    expect(strictest("segura")).toBe("segura");
  });

  it("ties a verdict to the exact kind and name", () => {
    expect(fingerprint({ kind: "sabe", name: "Cerámica " })).toBe(fingerprint({ kind: "sabe", name: "ceramica" }));
    expect(fingerprint({ kind: "sabe", name: "ceramica" })).not.toBe(fingerprint({ kind: "busca", name: "ceramica" }));
    expect(fingerprint({ kind: "sabe", name: "ceramica" })).not.toBe(fingerprint({ kind: "sabe", name: "ceramica gres" }));
  });
});
