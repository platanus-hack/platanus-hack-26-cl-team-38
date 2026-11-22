import { describe, expect, it } from "vitest";
import { CheckInSchema } from "@/lib/privacy/checkin";
import { fingerprint } from "@/lib/privacy/taxonomy";
import type { Kind, PersonalNode, TopicPrivacy } from "@/lib/types";
import { buildNode, editTopic, setShared, shareGeneral, shareRecommended } from "@/lib/node/node";
import type { SeedTopic } from "./seed-source";
import { checkInBody, summarize } from "./summary-model";

// A seed person plus the delicate topics an assistant would also extract. Verdicts are written by
// hand: these tests cover the screen, not the classifier (that is src/lib/privacy/).
type Case = [name: string, kind: Kind, level: TopicPrivacy["level"], extra?: Partial<TopicPrivacy>];
const CASES: Case[] = [
  ["escalada", "hace", "segura"],
  ["jazz", "le_gusta", "segura"],
  ["python", "sabe", "segura"],
  ["terapia para la ansiedad", "busca", "sensible", { category: "salud" }],
  ["salir de mis deudas", "busca", "sensible", { category: "situacion_economica" }],
  ["música cristiana", "le_gusta", "sensible", { category: "religion" }],
  ["cambiar de trabajo", "busca", "personal", { category: "laboral_delicado", saferName: "roles de producto" }],
  ["jefe de riesgo en banco estado", "es", "personal", { category: "identificable", saferName: "riesgo financiero" }],
  ["entrenar a las 7 en mi gimnasio", "hace", "personal", { category: "ubicacion_rutina" }],
  ["podcasts de crianza", "le_gusta", "personal", { category: "terceros" }],
];

const topics: SeedTopic[] = CASES.map(([name, kind]) => ({
  id: `p1.${name.replace(/ /g, "-")}`,
  name,
  kind,
  depth: 2,
  sources: ["chatgpt"],
}));
const verdicts: TopicPrivacy[] = CASES.map(([name, kind, level, extra]) => ({
  level,
  checkedFor: fingerprint({ kind, name }),
  decidedBy: "default",
  ...extra,
}));
const fresh = () => buildNode({ personId: "p1", displayName: "Ana" }, topics, verdicts);
const verdictFor = (kind: Kind, name: string, level: TopicPrivacy["level"]): TopicPrivacy => ({
  level,
  checkedFor: fingerprint({ kind, name }),
  decidedBy: "default",
});
const id = (name: string) => `p1.${name.replace(/ /g, "-")}`;
const sharedNames = (node: PersonalNode) => summarize(node).shared.map((t) => t.name);
const SENSITIVE = CASES.filter(([, , level]) => level === "sensible").map(([name]) => name);

describe("summary screen", () => {
  it("never shows, counts or keeps a dropped topic", () => {
    const node = fresh();
    const summary = summarize(node);
    const onScreen = [...summary.recommended, ...summary.decide].map((t) => t.name);
    expect(onScreen).toHaveLength(7);
    expect(summary.keptCount).toBe(7);
    for (const name of SENSITIVE) expect(JSON.stringify(node)).not.toContain(name);
  });

  it("hides a sensitive topic even if one slips into the node", () => {
    const leaked: PersonalNode = {
      ...fresh(),
      topics: [...fresh().topics, { ...topics[3], public: true, privacy: { ...verdicts[3], decidedBy: "user" } }],
    };
    const summary = summarize(leaked);
    expect([...summary.recommended, ...summary.decide, ...summary.shared].map((t) => t.name)).not.toContain(
      "terapia para la ansiedad",
    );
    expect(checkInBody(leaked, "HACK26").topics.map((t) => t.name)).not.toContain("terapia para la ansiedad");
  });

  it("puts safe topics in the recommended pile and personal ones in 'Tú decides'", () => {
    const { recommended, decide } = summarize(fresh());
    expect(recommended.map((t) => t.name)).toEqual(["escalada", "jazz", "python"]);
    expect(decide.map((t) => t.name)).toEqual([
      "cambiar de trabajo",
      "jefe de riesgo en banco estado",
      "entrenar a las 7 en mi gimnasio",
      "podcasts de crianza",
    ]);
  });

  it("shares nothing until the owner taps", () => {
    expect(sharedNames(fresh())).toEqual([]);
    expect(checkInBody(fresh(), "HACK26").topics).toEqual([]);
  });

  it("shares the recommended pile with one tap and leaves personal topics private", () => {
    expect(sharedNames(shareRecommended(fresh()))).toEqual(["escalada", "jazz", "python"]);
  });

  it("keeps a recommended topic the owner turned off out of the bulk share", () => {
    expect(sharedNames(shareRecommended(setShared(fresh(), id("jazz"), false)))).toEqual(["escalada", "python"]);
  });

  it("shares a personal topic only after its own tap", () => {
    expect(sharedNames(setShared(fresh(), id("podcasts de crianza"), true))).toEqual(["podcasts de crianza"]);
  });

  it("shares the general version without the original or any link to it", () => {
    const node = shareGeneral(
      fresh(),
      id("jefe de riesgo en banco estado"),
      verdictFor("es", "riesgo financiero", "segura"),
    ) as PersonalNode;
    expect(sharedNames(node)).toEqual(["riesgo financiero"]);
    expect(JSON.stringify(checkInBody(node, "HACK26"))).not.toMatch(/banco|jefe/);
  });

  it("refuses a general version the filter drops", () => {
    expect(
      shareGeneral(fresh(), id("cambiar de trabajo"), verdictFor("busca", "roles de producto", "sensible")),
    ).toHaveProperty("error");
  });

  it("sends an edited topic back to private", () => {
    const shared = shareRecommended(fresh());
    const node = editTopic(
      shared,
      id("escalada"),
      { name: "escalada deportiva", kind: "hace" },
      verdictFor("hace", "escalada deportiva", "segura"),
    ) as PersonalNode;
    expect(sharedNames(node)).toEqual(["jazz", "python"]);
    expect(summarize(node).recommended.map((t) => t.name)).toContain("escalada deportiva");
  });

  it("refuses an edit into a sensitive topic and keeps the old one", () => {
    const result = editTopic(
      fresh(),
      id("escalada"),
      { name: "mi depresión", kind: "busca" },
      verdictFor("busca", "mi depresión", "sensible"),
    );
    expect(result).toHaveProperty("error");
  });

  it("builds a check-in body the server schema accepts, with no private fields", () => {
    const body = checkInBody(setShared(shareRecommended(fresh()), id("cambiar de trabajo"), true), "HACK26");
    expect(CheckInSchema.safeParse(body).success).toBe(true);
    expect(body.topics.map((t) => t.name)).toEqual(["escalada", "jazz", "python", "cambiar de trabajo"]);
    expect(JSON.stringify(body)).not.toMatch(/privacy|public|embedding|reason|saferName/);
  });
});
