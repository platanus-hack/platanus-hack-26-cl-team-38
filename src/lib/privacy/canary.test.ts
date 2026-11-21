import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalNode, Signal, Topic } from "@/lib/types";
import { admitCheckIn } from "./checkin";
import { classifyTopics, createCachedClassifier } from "./classify";
import { SENSITIVE_OBVIOUS } from "./eval-set";
import type { Judge } from "./judge";
import { projectNode } from "./projection";
import { splitSignals } from "./signals";

const embedMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/embeddings", () => ({ embed: embedMock }));
beforeEach(() => {
  embedMock.mockReset().mockImplementation(async (texts: string[]) => texts.map((_, i) => [i === 0 ? 1 : 0, i === 0 ? 0 : 1]));
});

const EVIDENCE = "canario-evidencia-7f3a";
const safeLabels = ["escalada", "jazz", "ruby on rails"];
const signals: Signal[] = [
  ...SENSITIVE_OBVIOUS.map((c) => ({ source: "chatgpt" as const, kind: c.kind, label: c.name, strength: 0.8, evidence: EVIDENCE })),
  ...safeLabels.map((label) => ({ source: "claude" as const, kind: "hace" as const, label, strength: 0.8, evidence: EVIDENCE })),
];

// Worst case on every side the deterministic layer does not control: a judge that approves
// everything, a synthesizer that passes labels through, and an owner who taps "share all".
const approvesEverything: Judge = async (topics) => topics.map(() => ({ level: "segura" as const }));

async function nodeSharingEverything(fromSignals: { kind: Topic["kind"]; label: string; source: Topic["sources"][number] }[]): Promise<PersonalNode> {
  const drafts = fromSignals.map((s) => ({ id: `p1.${s.label}`, name: s.label, kind: s.kind, depth: 1 as const, sources: [s.source] }));
  const classified = await classifyTopics(drafts, { judge: approvesEverything });
  return {
    personId: "p1",
    displayName: "Ana",
    version: 1,
    topics: drafts.map((d, i) => ({ ...d, public: true, privacy: { ...classified[i].privacy, decidedBy: "user" as const } })),
  };
}

describe("canary: sensitive signals against a judge that approves everything", () => {
  it("never sends a blocked signal or any evidence to the synthesizer", () => {
    const { sendable, held } = splitSignals(signals);
    expect(sendable.map((s) => s.label)).toEqual(safeLabels);
    expect(held).toHaveLength(SENSITIVE_OBVIOUS.length);
    expect(JSON.stringify(sendable)).not.toContain(EVIDENCE);
  });

  it("keeps them out of the projection even if they reach the node and the owner shares everything", async () => {
    const node = await nodeSharingEverything(signals);
    const { projection, withheld } = projectNode(node);
    expect(projection.topics.map((t) => t.name)).toEqual(safeLabels);
    expect(withheld).toHaveLength(SENSITIVE_OBVIOUS.length);
    expect(JSON.stringify(projection)).not.toContain(EVIDENCE);
  });

  it("keeps them out of the room even if a phone skips its own checks", async () => {
    const result = await admitCheckIn(
      { roomCode: "HACK26", personId: "p1", displayName: "Ana", topics: signals.map((s) => ({ id: `p1.${s.label}`, name: s.label, kind: s.kind, depth: 1, sources: [s.source] })) },
      { classify: createCachedClassifier(approvesEverything), embed: embedMock },
    );
    expect(result.ok && result.projection.topics.map((t) => t.name)).toEqual(safeLabels);
    expect(result.ok && result.rejected).toHaveLength(SENSITIVE_OBVIOUS.length);
  });
});
