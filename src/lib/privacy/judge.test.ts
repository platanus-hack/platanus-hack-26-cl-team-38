import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnthropicJudge, type JudgeInput } from "./judge";
import { describeJudge, resolveJudge } from "./judge-model";

type RawVerdict = { i: number; level: string; category: string; saferName: string };

function clientAnswering(answer: (items: { i: number; name: string }[]) => unknown) {
  const respond = async (params: { messages: { content: string }[] }) => answer(JSON.parse(params.messages[0].content));
  const parse = vi.fn(respond);
  const betaParse = vi.fn(respond);
  return {
    client: { messages: { parse }, beta: { messages: { parse: betaParse } } } as unknown as Anthropic,
    parse,
    betaParse,
  };
}

afterEach(() => vi.unstubAllEnvs());

const ok = (verdicts: RawVerdict[]) => ({ stop_reason: "end_turn", parsed_output: { verdicts } });
const safe = (i: number): RawVerdict => ({ i, level: "segura", category: "ninguna", saferName: "" });
const topics = (n: number): JudgeInput[] =>
  Array.from({ length: n }, (_, i) => ({ kind: "hace", name: `tema ${i}`, sources: ["claude"] }));

describe("createAnthropicJudge", () => {
  it("sends kind, name and sources only, to the fast model, without thinking", async () => {
    const { client, parse } = clientAnswering((items) => ok(items.map((item) => safe(item.i))));
    await createAnthropicJudge({ client })([{ kind: "sabe", name: "python", sources: ["github"] }]);
    const [params, requestOptions] = parse.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(params.model).toBe("claude-haiku-5-5");
    expect(params.thinking).toEqual({ type: "disabled" });
    expect(requestOptions.timeout).toBe(6000);
    expect(JSON.parse((params.messages as { content: string }[])[0].content)).toEqual([
      { i: 0, kind: "sabe", name: "python", sources: ["github"] },
    ]);
  });

  it("runs on Opus when the deploy asks for it, with a refusal fallback and a longer timeout", async () => {
    vi.stubEnv("PRIVACY_JUDGE_MODEL", "opus");
    const { client, parse, betaParse } = clientAnswering((items) => ok(items.map((item) => safe(item.i))));
    expect(await createAnthropicJudge({ client })(topics(1))).toEqual([
      { level: "segura", category: undefined, saferName: undefined },
    ]);
    expect(parse).not.toHaveBeenCalled();
    const [params, requestOptions] = betaParse.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(params).toMatchObject({
      model: "claude-opus-5-5",
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
    });
    expect(params).not.toHaveProperty("thinking");
    expect(requestOptions.timeout).toBe(12000);
  });

  it("splits a long list into parallel chunks and keeps the order", async () => {
    const { client, parse } = clientAnswering((items) =>
      ok(
        items.map((item) =>
          item.name === "tema 20" ? { i: item.i, level: "sensible", category: "salud", saferName: "" } : safe(item.i),
        ),
      ),
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

describe("resolveJudge", () => {
  it.each([
    [undefined, "claude-haiku-5-5", true],
    ["", "claude-haiku-5-5", true],
    ["haiku", "claude-haiku-5-5", true],
    ["opus", "claude-opus-5-5", true],
    [" Opus ", "claude-opus-5-5", true],
    ["claude-opus-5-5", "claude-opus-5-5", true],
    ["opus-5.5", "claude-haiku-5-5", false],
    ["gpt-5", "claude-haiku-5-5", false],
  ])("reads PRIVACY_JUDGE_MODEL=%j as %s", (value, model, recognized) => {
    expect(resolveJudge(value)).toMatchObject({ config: { model }, recognized });
  });

  it("says in one line which model is running, or why it is not the one asked for", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    expect(describeJudge("opus")).toBe("[privacy] juez: claude-opus-5-5");
    expect(describeJudge(undefined)).toBe("[privacy] juez: claude-haiku-5-5");
    expect(describeJudge("opus-5.5")).toContain(
      'PRIVACY_JUDGE_MODEL="opus-5.5" no es "haiku" ni "opus": el juez corre con claude-haiku-5-5',
    );
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
    expect(describeJudge("opus")).toContain("sin ANTHROPIC_API_KEY");
  });
});
