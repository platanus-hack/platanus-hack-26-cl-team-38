import { describe, expect, it, vi } from "vitest";
import { admitCheckIn } from "./checkin";
import type { Classified } from "./classify";
import type { JudgeInput } from "./judge";
import type { PrivacyLevel } from "./taxonomy";

const verdict = (level: PrivacyLevel, judged = true): Classified => ({
  privacy: { level, checkedFor: "x", decidedBy: "default" },
  by: null,
  judged,
});

function deps(verdicts: Record<string, Classified> = {}) {
  return {
    classify: vi.fn(async (topics: JudgeInput[]) => topics.map((t) => verdicts[t.name] ?? verdict("segura"))),
    embed: vi.fn(async (texts: string[]) => texts.map((_, i) => [i, 1])),
  };
}

const topic = (name: string, extra: Record<string, unknown> = {}) => ({ id: `p1.${name}`, name, kind: "hace", depth: 2, sources: ["claude"], ...extra });
const body = (topics: unknown[], extra: Record<string, unknown> = {}) => ({ roomCode: "HACK26", personId: "p1", displayName: "Ana", topics, ...extra });

describe("admitCheckIn", () => {
  it("admits what the server itself classified as safe or personal, with server-side embeddings", async () => {
    const result = await admitCheckIn(body([topic("escalada"), topic("riesgo en banco x")]), deps({ "riesgo en banco x": verdict("personal") }));
    expect(result).toMatchObject({ ok: true, roomCode: "HACK26", rejected: [] });
    if (!result.ok) return;
    expect(result.projection).toEqual({
      personId: "p1",
      displayName: "Ana",
      topics: [
        { ...topic("escalada"), embedding: [0, 1] },
        { ...topic("riesgo en banco x"), embedding: [1, 1] },
      ],
    });
  });

  it("rejects a sensitive topic and one nobody could review, and lets the rest in", async () => {
    const result = await admitCheckIn(
      body([topic("sesiones con la psiquiatra"), topic("escalada"), topic("sin veredicto")]),
      deps({ "sesiones con la psiquiatra": verdict("sensible"), "sin veredicto": verdict("personal", false) }),
    );
    expect(result).toMatchObject({
      ok: true,
      rejected: [
        { topicId: "p1.sesiones con la psiquiatra", reason: "sensible" },
        { topicId: "p1.sin veredicto", reason: "sin_revisar" },
      ],
    });
    if (result.ok) expect(result.projection.topics.map((t) => t.name)).toEqual(["escalada"]);
  });

  it.each([
    ["a verdict claimed by the phone", body([topic("escalada", { privacy: { level: "segura" } })])],
    ["an embedding computed by the phone", body([topic("escalada", { embedding: [1, 0] })])],
    ["evidence", body([topic("escalada", { evidence: "me lo contó en un chat" })])],
    ["an intent next to the projection", body([topic("escalada")], { intent: "hoy busco pega" })],
    ["a free-text topic", body([topic("x".repeat(81))])],
    ["contact data in the display name", body([topic("escalada")], { displayName: "Ana 9 8765 4321" })],
    ["nothing parseable", null],
  ])("refuses a request with %s before classifying anything", async (_case, request) => {
    const fakes = deps();
    expect(await admitCheckIn(request, fakes)).toMatchObject({ ok: false });
    expect(fakes.classify).not.toHaveBeenCalled();
  });
});
