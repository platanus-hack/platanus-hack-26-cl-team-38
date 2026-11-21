import { describe, expect, it } from "vitest";
import { layoutPreview, RING, type PreviewInput } from "./preview-layout";

const topics: PreviewInput[] = Array.from({ length: 24 }, (_, i) => ({ id: `t${i}`, public: i % 3 === 0, depth: ((i % 3) + 1) as 1 | 2 | 3 }));
const distance = ({ x, y }: { x: number; y: number }) => Math.hypot(x, y);

describe("layoutPreview", () => {
  it("puts public topics inside the ring and private ones outside", () => {
    const layout = layoutPreview(topics);
    for (const t of topics) {
      const d = distance(layout.get(t.id)!);
      if (t.public) expect(d).toBeLessThan(RING);
      else expect(d).toBeGreaterThan(RING);
    }
  });

  it("gives the same picture for the same input", () => {
    expect(layoutPreview(topics)).toEqual(layoutPreview(topics));
  });

  it("moves a topic across the ring when it changes side", () => {
    const before = layoutPreview(topics);
    const flipped = topics.map((t) => (t.id === "t1" ? { ...t, public: true } : t));
    expect(distance(layoutPreview(flipped, before).get("t1")!)).toBeLessThan(RING);
  });
});
