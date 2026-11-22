import { describe, expect, it } from "vitest";
import type { PlanMessageView, PlanView } from "@/lib/types";
import { going, layout, MAX_DOTS, networkOf, paced } from "./plan-network";

const message = (id: number, round: number, extra: Partial<PlanMessageView>): PlanMessageView => ({ id, round, agent: "miembro", personId: null, text: "…", aportes: [], createdAt: "2026-11-22T12:00:00Z", ...extra });
const red = (fuente: number) => ({ texto: "Un dato", origen: "red" as const, fuente });

const content = { resumen: "Sábado en la viña", decisiones: [], pasos: [], abiertos: [], desacuerdos: [] };
const plan: PlanView = {
  id: "plan-1",
  ownerId: "yo",
  intent: "Celebrar en una viña",
  status: "consenso",
  round: 1,
  maxRounds: 5,
  members: [
    { personId: "yo", displayName: "Oscar Pérez", contacts: 3 },
    { personId: "ana", displayName: "Ana Rojas", contacts: 12 },
    { personId: "beto", displayName: "Beto Lagos", contacts: 0 },
    { personId: "carla", displayName: "Carla Soto", contacts: 2 },
  ],
  myRestrictions: [],
  plan: { version: 1, content, decidedBy: "consenso" },
  messages: [
    message(1, 0, { personId: "yo", participa: true }),
    message(2, 0, { personId: "ana", participa: true, aportes: [red(1), red(9), { texto: "Algo suyo", origen: "propio" }] }),
    message(3, 0, { personId: "beto", participa: false }),
    message(4, 0, { personId: "carla" }),
    message(5, 1, { agent: "orquestador", proposal: { version: 1, final: false, content } }),
    message(6, 1, { personId: "ana", decision: "accept", aportes: [red(1)] }),
    message(7, 1, { personId: "carla", decision: "adjust" }),
  ],
  createdAt: "2026-11-22T12:00:00Z",
  updatedAt: "2026-11-22T12:01:00Z",
};

describe("la red de un plan", () => {
  it("confirman todos menos quien dijo que no puede", () => {
    // Carla's opening comes from before `participa` existed: she counts as in.
    expect(going(plan)).toEqual(["yo", "ana", "carla"]);
  });

  it("los mensajes salen de a uno, y mientras falte alguno el plan sigue deliberando", () => {
    expect(paced(plan, 7)).toBe(plan);
    expect(paced(plan, 99)).toBe(plan);
    const opening = paced(plan, 3);
    expect(opening).toMatchObject({ status: "deliberando", round: 0, plan: null });
    expect(opening.messages.map((m) => m.id)).toEqual([1, 2, 3]);
    // The proposal shows with the orchestrator's message, still without a verdict.
    expect(paced(plan, 5)).toMatchObject({ status: "deliberando", round: 1, plan: { version: 1, decidedBy: null } });
  });

  it("dice quién va, quién no y de qué contactos salió algo", () => {
    const net = networkOf(plan, "ana", ["yo", "ana"]);
    expect(net.members.map((m) => [m.personId, m.status, m.decision, m.confirmed])).toEqual([
      ["yo", "va", undefined, true],
      ["ana", "va", "accept", true],
      ["beto", "no_va", undefined, false],
      ["carla", "va", "adjust", false],
    ]);
    const ana = net.members[1];
    expect(ana).toMatchObject({ name: "Ana", me: true, owner: false, contacts: 12, dots: MAX_DOTS });
    // Contact 9 is beyond the 7 drawn: it lights the second dot.
    expect(ana.lit).toEqual([0, 1]);
    expect(net.members[2]).toMatchObject({ dots: 0, lit: [] });
    expect(net).toMatchObject({ consulting: false, answered: 4, fromNetwork: 3, confirmed: 2 });
  });

  it("mientras alguien no ha respondido, los Agentes están consultando", () => {
    const net = networkOf(paced(plan, 2), "yo");
    expect(net.consulting).toBe(true);
    expect(net.members.map((m) => m.status)).toEqual(["va", "va", "esperando", "esperando"]);
    expect(net.answered).toBe(2);
  });

  it("pone a quien creó el plan al medio y a cada contacto del lado de su persona", () => {
    const { members } = networkOf(plan, "yo");
    const at = layout(members, 600, 600);
    expect(at.yo.at).toEqual({ x: 300, y: 300 });
    expect(at.yo.dots).toHaveLength(3);
    // Ana is straight up, and her contacts are further up than she is.
    expect(at.ana.at.x).toBeCloseTo(300);
    expect(at.ana.at.y).toBeLessThan(300);
    expect(at.ana.dots).toHaveLength(MAX_DOTS);
    for (const dot of at.ana.dots) expect(dot.y).toBeLessThan(at.ana.at.y);
    expect(at.beto.dots).toEqual([]);
    for (const { at: p, dots } of Object.values(at)) for (const q of [p, ...dots]) expect(q.x >= 0 && q.x <= 600 && q.y >= 0 && q.y <= 600).toBe(true);
  });
});
