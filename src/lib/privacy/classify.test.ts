import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANCHORS } from "./anchors";
import { classifyTopics, createCachedClassifier } from "./classify";
import type { Judge, JudgeInput, JudgeVerdict } from "./judge";
import { fingerprint } from "./taxonomy";

// One axis per text, so a topic is "near an anchor" only when a test says so with NEAR.
const NEAR = "cerca de un ancla";
const anchorPhrases = Object.values(ANCHORS).flat();
const embedMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/embeddings", () => ({ embed: embedMock }));

function fakeEmbed(texts: string[]): Promise<number[][]> {
  return Promise.resolve(
    texts.map((text) => {
      const vector = new Array(anchorPhrases.length + 1).fill(0);
      const anchorIndex = anchorPhrases.indexOf(text);
      if (anchorIndex >= 0 || text.includes(NEAR)) vector[Math.max(anchorIndex, 0)] = 1;
      else vector[anchorPhrases.length] = 1;
      return vector;
    }),
  );
}

function judgeSaying(verdicts: Record<string, JudgeVerdict | null>): Judge & { seen: JudgeInput[] } {
  const seen: JudgeInput[] = [];
  const judge = async (topics: JudgeInput[]) => {
    seen.push(...topics);
    return topics.map((t) => (t.name in verdicts ? verdicts[t.name] : { level: "segura" as const }));
  };
  return Object.assign(judge, { seen });
}

beforeEach(() => {
  embedMock.mockReset().mockImplementation(fakeEmbed);
});

describe("classifyTopics", () => {
  it("passes a topic only when every layer lets it through", async () => {
    const [result] = await classifyTopics([{ kind: "hace", name: "escalada" }], { judge: judgeSaying({}) });
    expect(result).toEqual({
      privacy: { level: "segura", checkedFor: fingerprint({ kind: "hace", name: "escalada" }), decidedBy: "default" },
      by: null,
      judged: true,
    });
  });

  it("never sends to the judge what the lexicon already blocked", async () => {
    const judge = judgeSaying({});
    const [blocked, passed] = await classifyTopics(
      [
        { kind: "busca", name: "terapia para la ansiedad" },
        { kind: "hace", name: "escalada" },
      ],
      { judge },
    );
    expect(blocked).toMatchObject({ privacy: { level: "sensible", category: "salud" }, by: "lexico" });
    expect(passed.privacy.level).toBe("segura");
    expect(judge.seen.map((t) => t.name)).toEqual(["escalada"]);
  });

  it("keeps the judge's verdict and safer name, and explains it with fixed copy", async () => {
    const judge = judgeSaying({
      "jefe de riesgo en banco x": { level: "personal", category: "identificable", saferName: "riesgo financiero" },
      "sesiones con la psiquiatra": { level: "sensible", category: "salud" },
    });
    const [personal, sensitive] = await classifyTopics(
      [
        { kind: "es", name: "jefe de riesgo en banco x" },
        { kind: "hace", name: "sesiones con la psiquiatra" },
      ],
      { judge },
    );
    expect(personal).toMatchObject({
      privacy: { level: "personal", category: "identificable", reason: "Dice dónde trabajas, tu cargo o cómo ubicarte.", saferName: "riesgo financiero" },
      by: "juez",
    });
    expect(sensitive).toMatchObject({ privacy: { level: "sensible", category: "salud", reason: "Toca un tema de salud." }, by: "juez" });
    expect(sensitive.privacy.saferName).toBeUndefined();
  });

  it("drops a safer name that would itself be blocked", async () => {
    const judge = judgeSaying({ "algo delicado": { level: "personal", category: "vida_intima", saferName: "mi depresión" } });
    const [result] = await classifyTopics([{ kind: "busca", name: "algo delicado" }], { judge });
    expect(result.privacy.saferName).toBeUndefined();
  });

  it("holds a topic back as personal when the judge does not answer", async () => {
    const throwing: Judge = () => Promise.reject(new Error("timeout"));
    for (const judge of [undefined, throwing, judgeSaying({ escalada: null })]) {
      const [result] = await classifyTopics([{ kind: "hace", name: "escalada" }], { judge });
      expect(result).toMatchObject({ privacy: { level: "personal" }, by: "sin_juez" });
    }
  });

  it("still reports the anchor when the judge does not answer", async () => {
    const [result] = await classifyTopics([{ kind: "hace", name: `algo ${NEAR}` }]);
    expect(result).toMatchObject({ privacy: { level: "personal", category: "salud" }, by: "ancla" });
  });

  it("raises to personal what the judge passed but sits next to a sensitive anchor", async () => {
    const [result] = await classifyTopics([{ kind: "hace", name: `algo ${NEAR}` }], { judge: judgeSaying({}) });
    expect(result).toMatchObject({ privacy: { level: "personal", category: "salud" }, by: "ancla" });
  });

  it("does not let an anchor override expertise or lower the judge", async () => {
    const judge = judgeSaying({ [`vivido ${NEAR}`]: { level: "sensible", category: "religion" } });
    const [expertise, lived] = await classifyTopics(
      [
        { kind: "sabe", name: `oficio ${NEAR}` },
        { kind: "hace", name: `vivido ${NEAR}` },
      ],
      { judge },
    );
    expect(expertise.privacy.level).toBe("segura");
    expect(lived).toMatchObject({ privacy: { level: "sensible", category: "religion" }, by: "juez" });
  });

  it("holds everything back when the embeddings fail", async () => {
    embedMock.mockRejectedValue(new Error("model not loaded"));
    const [result] = await classifyTopics([{ kind: "hace", name: "escalada" }], { judge: judgeSaying({}) });
    expect(result).toMatchObject({ privacy: { level: "personal" }, by: "ancla" });
  });

  it("treats free text as personal even if the judge passes it", async () => {
    const name = "una frase larguísima que claramente no es un tópico de una a cuatro palabras";
    const [result] = await classifyTopics([{ kind: "hace", name }], { judge: judgeSaying({}) });
    expect(result).toMatchObject({ privacy: { level: "personal", category: "unico" }, by: "patron" });
  });
});

describe("createCachedClassifier", () => {
  it("asks the judge once per topic and keeps its first answer", async () => {
    let calls = 0;
    const flaky: Judge = async (topics) => topics.map(() => ({ level: calls++ === 0 ? ("sensible" as const) : ("segura" as const) }));
    const classify = createCachedClassifier(flaky);
    const topic = { kind: "hace" as const, name: "algo ambiguo", sources: ["claude" as const] };
    expect((await classify([topic]))[0].privacy.level).toBe("sensible");
    expect((await classify([topic, { ...topic, name: "Algo  Ambiguo" }])).map((c) => c.privacy.level)).toEqual(["sensible", "sensible"]);
    expect(calls).toBe(1);
  });

  it("does not remember a topic the judge never answered, so it is asked again", async () => {
    let up = false;
    const judge: Judge = async (topics) => topics.map(() => (up ? { level: "segura" as const } : null));
    const classify = createCachedClassifier(judge);
    expect((await classify([{ kind: "hace", name: "escalada" }]))[0]).toMatchObject({ judged: false, privacy: { level: "personal" } });
    up = true;
    expect((await classify([{ kind: "hace", name: "escalada" }]))[0]).toMatchObject({ judged: true, privacy: { level: "segura" } });
  });

  it("judges the same name again when it comes from other sources", async () => {
    const seen: string[] = [];
    const judge: Judge = async (topics) => topics.map((t) => (seen.push((t.sources ?? []).join()), { level: "segura" as const }));
    const classify = createCachedClassifier(judge);
    await classify([{ kind: "le_gusta", name: "podcasts", sources: ["claude"] }]);
    await classify([{ kind: "le_gusta", name: "podcasts", sources: ["spotify"] }]);
    expect(seen).toEqual(["claude", "spotify"]);
  });
});
