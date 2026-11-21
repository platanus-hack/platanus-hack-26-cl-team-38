import { describe, expect, it } from "vitest";
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

describe("admitSignals", () => {
  it("drops what the lexicon blocks and keeps the rest, lowercased", () => {
    const parsed = IncomingSignalsSchema.parse([signal("Open Banking"), signal("sesiones con mi psiquiatra", { kind: "hace" }), signal("ana@ejemplo.cl", { kind: "es" })]);
    expect(admitSignals(parsed)).toEqual({ accepted: [signal("open banking")], held: 2 });
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
  });

  it("gives an example link that the parser and the schema accept", () => {
    const prompt = buildAssistantPrompt({ origin: "https://app.test", token: "tok" });
    const example = prompt.match(/Forma del enlace: \S+(#\S+)/)?.[1] ?? "";
    expect(IncomingSignalsSchema.parse(parseAssistantLink(example).signals)).toHaveLength(3);
  });
});
