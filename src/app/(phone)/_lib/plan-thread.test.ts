import { describe, expect, it } from "vitest";
import type { PlanContent, PlanMessageView, PlanView } from "@/lib/types";
import { changes, threadOf } from "./plan-thread";

let id = 0;
const msg = (round: number, extra: Partial<PlanMessageView>): PlanMessageView => ({ id: ++id, round, agent: "miembro", personId: null, text: "…", aportes: [], createdAt: "2026-11-22T12:00:00Z", ...extra });
const content = (resumen: string, decisiones: [string, string][] = []): PlanContent => ({
  resumen,
  decisiones: decisiones.map(([tema, valor]) => ({ tema, valor, porque: "" })),
  pasos: [],
  abiertos: [],
  desacuerdos: [],
});
const proposal = (round: number, version: number, c: PlanContent, final = false) => msg(round, { agent: "orquestador", proposal: { version, final, content: c } });
const opening = ["yo", "ana", "beto"].map((p) => msg(0, { personId: p, participa: true }));
const v1 = content("Sábado en Pirque", [["fecha", "sábado 17"], ["lugar", "Pirque"]]);
const v2 = content("Sábado en Pirque con carpa", [["fecha", "sábado 17"], ["lugar", "Pirque, con carpa"], ["música", "DJ"]]);

const planOf = (messages: PlanMessageView[], status: PlanView["status"] = "deliberando"): PlanView => ({
  id: "plan-1",
  ownerId: "yo",
  intent: "Matrimonio",
  status,
  round: 0,
  maxRounds: 5,
  members: ["yo", "ana", "beto"].map((p) => ({ personId: p, displayName: p, contacts: 0 })),
  myRestrictions: [],
  plan: null,
  messages,
  createdAt: "2026-11-22T12:00:00Z",
  updatedAt: "2026-11-22T12:00:00Z",
});

describe("el hilo de un plan", () => {
  it("parte en la apertura, con todos escribiendo en la misma etapa", () => {
    const t = threadOf(planOf(opening.slice(0, 1)));
    expect(t.steps).toHaveLength(1);
    expect(t.steps[0]).toMatchObject({ kind: "opening", current: true });
    expect(t.writers).toEqual(["ana", "beto"]);
    expect(t.drafting).toBeNull();
  });

  it("cuando respondieron todos, el orquestador redacta la propuesta siguiente", () => {
    const t = threadOf(planOf(opening));
    expect(t.steps[0].current).toBe(false);
    expect(t.drafting).toEqual({ version: 1, final: false });
  });

  it("cada propuesta abre su etapa con las respuestas a ella, y cuenta cómo terminó", () => {
    const t = threadOf(
      planOf([
        ...opening,
        proposal(1, 1, v1),
        msg(1, { personId: "yo", decision: "accept" }),
        msg(1, { personId: "ana", decision: "adjust" }),
        msg(1, { personId: "beto", decision: "accept" }),
        proposal(2, 2, v2),
        msg(2, { personId: "ana", decision: "accept" }),
      ]),
    );
    expect(t.steps.map((s) => (s.kind === "opening" ? "apertura" : s.proposal.version))).toEqual(["apertura", 1, 2]);
    const [, first, second] = t.steps;
    expect(first).toMatchObject({ messages: { length: 3 }, current: false, tally: { accept: 2, adjust: 1, block: 0, all: false } });
    expect(second).toMatchObject({ current: true, previous: v1 });
    expect(second.kind === "proposal" && second.tally).toBeUndefined();
    expect(t.writers).toEqual(["yo", "beto"]);
  });

  it("con el plan cerrado, la última etapa también cuenta y nadie escribe", () => {
    const t = threadOf(planOf([...opening, proposal(1, 1, v1), ...["yo", "ana", "beto"].map((p) => msg(1, { personId: p, decision: "accept" }))], "consenso"));
    expect(t.steps.at(-1)).toMatchObject({ current: false, tally: { all: true } });
    expect(t.writers).toEqual([]);
    expect(t.drafting).toBeNull();
  });

  it("después de la última ronda, lo que se redacta es la decisión final", () => {
    const rounds = [1, 2, 3, 4, 5].flatMap((r) => [proposal(r, r, v1), ...["yo", "ana", "beto"].map((p) => msg(r, { personId: p, decision: "adjust" }))]);
    expect(threadOf(planOf([...opening, ...rounds])).drafting).toEqual({ version: 6, final: true });
    const closed = threadOf(planOf([...opening, ...rounds, proposal(5, 6, v2, true)], "decidido"));
    expect(closed.steps.at(-1)).toMatchObject({ kind: "proposal", proposal: { final: true } });
    expect(closed.steps.at(-1)!.kind === "proposal" && closed.steps.at(-1)).not.toHaveProperty("tally");
  });

  it("marca qué decisiones son nuevas o cambiaron respecto de la propuesta anterior", () => {
    expect(changes(v2, v1)).toEqual([null, "cambio", "nuevo"]);
    expect(changes(v1)).toEqual([null, null]);
  });
});
