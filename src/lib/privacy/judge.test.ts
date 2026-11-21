import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { createAnthropicJudge, JUDGE_MODEL, type JudgeInput } from "./judge";

type RawVerdict = { i: number; level: string; category: string; saferName: string };

function clientAnswering(answer: (items: { i: number; name: string }[]) => unknown) {
  const parse = vi.fn(async (params: { messages: { content: string }[] }) => answer(JSON.parse(params.messages[0].content)));
  return { client: { messages: { parse } } as unknown as Anthropic, parse };
}

const ok = (verdicts: RawVerdict[]) => ({ stop_reason: "end_turn", parsed_output: { verdicts } });
const safe = (i: number): RawVerdict => ({ i, level: "segura", category: "ninguna", saferName: "" });
const topics = (n: number): JudgeInput[] => Array.from({ length: n }, (_, i) => ({ kind: "hace", name: `tema ${i}`, sources: ["claude"] }));

describe("createAnthropicJudge", () => {
  it("sends kind, name and sources only, to the fast model, without thinking", async () => {
    const { client, parse } = clientAnswering((items) => ok(items.map((item) => safe(item.i))));
    await createAnthropicJudge({ client })([{ kind: "sabe", name: "python", sources: ["github"] }]);
    const [params] = parse.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(params.model).toBe(JUDGE_MODEL);
    expect(params.thinking).toEqual({ type: "disabled" });
    expect(JSON.parse((params.messages as { content: string }[])[0].content)).toEqual([{ i: 0, kind: "sabe", name: "python", sources: ["github"] }]);
  });

  it("splits a long list into parallel chunks and keeps the order", async () => {
    const { client, parse } = clientAnswering((items) =>
      ok(items.map((item) => (item.name === "tema 20" ? { i: item.i, level: "sensible", category: "salud", saferName: "" } : safe(item.i)))),
    );
    const verdicts = await createAnthropicJudge({ client })(topics(30));
    expect(parse).toHaveBeenCalledTimes(8);
    expect(verdicts).toHaveLength(30);
    expect(verdicts.map((v) => v?.level).indexOf("sensible")).toBe(20);
  });

  it("normalizes the answer: stricter reading of a mismatched category, no safer name unless personal", async () => {
    const { client } = clientAnswering(() =>
      ok([
        { i: 0, level: "segura", category: "salud", saferName: "bienestar" },
        { i: 1, level: "personal", category: "identificable", saferName: " Riesgo Financiero " },
        { i: 2, level: "sensible", category: "unico", saferName: "" },
      ]),
    );
    expect(await createAnthropicJudge({ client })(topics(3))).toEqual([
      { level: "sensible", category: "salud", saferName: undefined },
      { level: "personal", category: "identificable", saferName: "riesgo financiero" },
      { level: "sensible", category: undefined, saferName: undefined },
    ]);
  });

  it("leaves unjudged any topic the model skipped or answered twice", async () => {
    const { client } = clientAnswering(() => ok([safe(0), safe(2), safe(2)]));
    const verdicts = await createAnthropicJudge({ client })(topics(3));
    expect(verdicts.map((v) => v?.level ?? null)).toEqual(["segura", null, null]);
  });

  it.each([
    ["the request fails", () => Promise.reject(new Error("timeout"))],
    ["the model refuses", () => ({ stop_reason: "refusal", parsed_output: null })],
    ["the output is cut off", () => ({ stop_reason: "max_tokens", parsed_output: null })],
  ])("leaves the whole chunk unjudged when %s", async (_case, answer) => {
    const onError = vi.fn();
    const { client } = clientAnswering(answer);
    expect(await createAnthropicJudge({ client, onError })(topics(2))).toEqual([null, null]);
    expect(onError).toHaveBeenCalledOnce();
  });
});
