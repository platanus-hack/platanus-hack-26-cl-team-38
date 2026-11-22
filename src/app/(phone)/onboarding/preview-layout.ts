import { forceCollide, forceManyBody, forceRadial, forceSimulation, type SimulationNodeDatum } from "d3-force";

// The preview draws one picture of the privacy line: the owner in the middle, what the room sees
// inside the ring, what stays private outside it.

export const RING = 125;
const BANDS = { public: { target: 85, min: 45, max: RING - 14 }, private: { target: 170, min: RING + 16, max: 205 } };

export type PreviewInput = { id: string; public: boolean; depth: 1 | 2 | 3 };
export type Point = { x: number; y: number };

export const nodeRadius = (depth: number) => 4 + depth * 2.5;

type Sim = SimulationNodeDatum & PreviewInput & { r: number };

// Deterministic for the same input: no Math.random, a fixed number of ticks, and new nodes start on
// their band at an angle given by their position in the list.
export function layoutPreview(topics: PreviewInput[], previous: Map<string, Point> = new Map()): Map<string, Point> {
  const nodes: Sim[] = topics.map((t, i) => {
    const band = BANDS[t.public ? "public" : "private"];
    const prev = previous.get(t.id);
    const angle = (i / Math.max(1, topics.length)) * 2 * Math.PI;
    return {
      ...t,
      r: nodeRadius(t.depth),
      x: prev?.x ?? Math.cos(angle) * band.target,
      y: prev?.y ?? Math.sin(angle) * band.target,
    };
  });
  const owner: Sim = { id: "", public: true, depth: 3, r: 24, x: 0, y: 0, fx: 0, fy: 0 };

  forceSimulation<Sim>([owner, ...nodes])
    .force(
      "radial",
      forceRadial<Sim>((d) => (d === owner ? 0 : BANDS[d.public ? "public" : "private"].target)).strength(0.8),
    )
    .force(
      "collide",
      forceCollide<Sim>((d) => d.r + 16),
    )
    .force("charge", forceManyBody<Sim>().strength(-25))
    .stop()
    .tick(160);

  return new Map(
    nodes.map((n) => {
      const band = BANDS[n.public ? "public" : "private"];
      const distance = Math.hypot(n.x!, n.y!) || 1;
      const clamped = Math.min(band.max, Math.max(band.min, distance));
      return [n.id, { x: (n.x! / distance) * clamped, y: (n.y! / distance) * clamped }];
    }),
  );
}
