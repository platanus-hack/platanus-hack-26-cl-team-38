import { describe, expect, it } from "vitest";
import type { PlanMessageView, PlanView } from "@/lib/types";
import { writing } from "./writing";

const members = [
  { personId: "yo", displayName: "Oscar" },
  { personId: "ana", displayName: "Ana" },
  { personId: "beto", displayName: "Beto" },
];
const msg = (round: number, agent: PlanMessageView["agent"], personId: string | null): PlanMessageView => ({
  id: Math.random(),
  round,
  agent,
  personId,
  text: "…",
  aportes: [],
  createdAt: "2026-11-22T00:00:00Z",
});
const plan = (messages: PlanMessageView[], status: PlanView["status"] = "deliberando") => ({ status, members, messages });

describe("quién está escribiendo", () => {
  it("al partir escriben todos los agentes", () => {
    expect(writing(plan([]))).toEqual({ members: ["yo", "ana", "beto"], orchestrator: false });
  });

  it("cada agente deja de escribir cuando llega su respuesta, o el aviso de que no respondió", () => {
    expect(writing(plan([msg(0, "miembro", "ana")]))).toEqual({ members: ["yo", "beto"], orchestrator: false });
    expect(writing(plan([msg(0, "miembro", "ana"), msg(0, "verificador", "beto")]))).toEqual({ members: ["yo"], orchestrator: false });
  });

  it("cuando respondieron todos escribe el orquestador, y después su propuesta abre otra ronda", () => {
    const opening = members.map((m) => msg(0, "miembro", m.personId));
    expect(writing(plan(opening))).toEqual({ members: [], orchestrator: true });
    expect(writing(plan([...opening, msg(1, "orquestador", null), msg(1, "miembro", "yo")]))).toEqual({ members: ["ana", "beto"], orchestrator: false });
  });

  it("un plan cerrado no espera a nadie", () => {
    expect(writing(plan([], "consenso"))).toEqual({ members: [], orchestrator: false });
  });
});
