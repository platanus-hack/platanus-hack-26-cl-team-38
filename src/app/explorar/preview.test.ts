import { describe, expect, it } from "vitest";
import seed from "../../../seed/rooms.json";
import type { PublicProjection } from "@/lib/types";
import { previewThemes } from "./preview";

const room = (id: string) => seed.rooms.find((r) => r.id === id)!.projections as PublicProjection[];

describe("previewThemes", () => {
  it("joins escalada and trekking into one theme with a complement", () => {
    const theme = previewThemes(room("seed-mut"), 0.6).find((t) => t.topicNames.includes("escalada"))!;
    expect(theme.topicNames).toContain("trekking");
    expect(theme.outcome).toBe("complemento");
  });

  it("marks juegos de mesa as affinity and machine learning as no mesa", () => {
    const themes = previewThemes(room("seed-mut"), 0.6);
    expect(themes.find((t) => t.name === "juegos de mesa")?.outcome).toBe("afinidad");
    expect(themes.find((t) => t.name === "machine learning")?.outcome).toBe("sin mesa");
  });

  it("finds nothing to build in the control room", () => {
    expect(previewThemes(room("seed-control"), 0.6).every((t) => t.outcome === "sin mesa")).toBe(true);
  });
});
