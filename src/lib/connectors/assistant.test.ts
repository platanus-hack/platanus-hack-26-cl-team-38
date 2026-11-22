import { describe, expect, it, vi } from "vitest";
import { admitSignals, buildAssistantPrompt, IncomingSignalsSchema, parseAssistantLink, parsePastedSignals } from "./assistant";

const signal = (label: string, extra: Record<string, unknown> = {}) => ({ source: "claude", kind: "sabe", label, strength: 0.8, ...extra });

describe("IncomingSignalsSchema", () => {
  it("accepts signals without evidence and rejects the ones that carry it", () => {
    expect(IncomingSignalsSchema.safeParse([signal("open banking")]).success).toBe(true);
    expect(IncomingSignalsSchema.safeParse([signal("open banking", { evidence: "me lo contó" })]).success).toBe(false);
  });

  it("only takes assistants as source, a known kind and a strength between 0 and 1", () => {
    expect(IncomingSignalsSchema.safeParse([signal("jazz", { source: "spotify" })]).success).toBe(false);
    expect(IncomingSignalsSchema.safeParse([signal("jazz", { kind: "opina" })]).success).toBe(false);
    expect(IncomingSignalsSchema.safeParse([signal("jazz", { strength: 7 })]).success).toBe(false);
    expect(IncomingSignalsSchema.safeParse([]).success).toBe(false);
  });
});

// Stands in for the privacy filter: the level of each topic is looked up by name.
const classifier = (levels: Record<string, string>) => vi.fn(async (topics: { name: string }[]) => topics.map((t) => ({ privacy: { level: (levels[t.name] ?? "segura") as "segura" | "personal" | "sensible" } })));

describe("admitSignals", () => {
  it("hands every signal to the privacy filter in the shape it already takes", async () => {
    const classify = classifier({});
    await admitSignals(IncomingSignalsSchema.parse([signal("Open Banking", { source: "chatgpt", kind: "es" })]), classify);
    expect(classify).toHaveBeenCalledWith([{ kind: "es", name: "open banking", sources: ["chatgpt"] }]);
  });

  it("drops what the filter calls sensible, keeps safe and personal, and returns the same shape", async () => {
    const parsed = IncomingSignalsSchema.parse([signal("Open Banking"), signal("mi tratamiento", { kind: "hace" }), signal("riesgo en banco x")]);
    const result = await admitSignals(parsed, classifier({ "mi tratamiento": "sensible", "riesgo en banco x": "personal" }));
    expect(result).toEqual({ accepted: [signal("open banking"), signal("riesgo en banco x")], held: 1 });
  });

  it("fails closed: a signal the filter gave no verdict for is not admitted", async () => {
    const result = await admitSignals(IncomingSignalsSchema.parse([signal("pagos"), signal("running")]), async () => [{ privacy: { level: "segura" } }]);
    expect(result).toEqual({ accepted: [signal("pagos")], held: 1 });
  });
});

describe("parseAssistantLink", () => {
  it("reads a link an assistant wrote by hand, including kinds and labels with separators", () => {
    const { token, signals } = parseAssistantLink("#abc123/chatgpt/sabe.open-banking.9/le_gusta.jazz-fusion.5/hace.node.js.7");
    expect(token).toBe("abc123");
    expect(IncomingSignalsSchema.parse(signals)).toEqual([
      { source: "chatgpt", kind: "sabe", label: "open banking", strength: 0.9 },
      { source: "chatgpt", kind: "le_gusta", label: "jazz fusion", strength: 0.5 },
      { source: "chatgpt", kind: "hace", label: "node.js", strength: 0.7 },
    ]);
  });

  it("turns a broken link into something the schema rejects, without throwing", () => {
    expect(IncomingSignalsSchema.safeParse(parseAssistantLink("#abc/claude/sin-puntos").signals).success).toBe(false);
    expect(IncomingSignalsSchema.safeParse(parseAssistantLink("#abc").signals).success).toBe(false);
    expect(parseAssistantLink("#%E0%A4%A").token).toBe("");
  });
});

describe("parsePastedSignals", () => {
  it("finds the array inside whatever the assistant wrapped it in", () => {
    const pasted = 'Aquí está:\n```json\n[{"source":"claude","kind":"sabe","label":"pagos","strength":0.8}]\n```\nAvísame si quieres cambios.';
    expect(IncomingSignalsSchema.parse(parsePastedSignals(pasted))).toHaveLength(1);
  });

  it("gives the schema something to reject when there is no array", () => {
    expect(IncomingSignalsSchema.safeParse(parsePastedSignals("no hay nada")).success).toBe(false);
    expect(IncomingSignalsSchema.safeParse(parsePastedSignals("[roto")).success).toBe(false);
  });
});

describe("buildAssistantPrompt", () => {
  it("carries both ways to deliver, the token and when it expires", () => {
    const prompt = buildAssistantPrompt({ origin: "https://app.test", token: "tok", minutes: 15 });
    expect(prompt).toContain('https://app.test/api/onboarding/signals, con el encabezado "Authorization: Bearer tok"');
    expect(prompt).toContain("https://app.test/c#tok/SOURCE/SEÑALES");
    expect(prompt).toContain("vence en 15 minutos");
    expect(prompt).toContain('la herramienta "subir_senales"), úsala con las señales y no sigas con las vías de abajo: el conector ya sabe a qué teléfono va');
  });

  it("gives an example link that the parser and the schema accept", () => {
    const prompt = buildAssistantPrompt({ origin: "https://app.test", token: "tok" });
    const example = prompt.match(/Forma del enlace: \S+(#\S+)/)?.[1] ?? "";
    expect(IncomingSignalsSchema.parse(parseAssistantLink(example).signals)).toHaveLength(3);
  });
});
