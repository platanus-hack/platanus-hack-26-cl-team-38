import { describe, expect, it } from "vitest";
import type { ProximityNeighbor } from "@/lib/types";
import { type Encounter, nearby } from "./people";

const encounter = (personId: string): Encounter => ({
  person: { personId, displayName: personId, topics: [] },
  distanceM: 0,
  radiusM: 100,
  at: "2026-11-22T00:00:00.000Z",
  place: "HACK26",
  relation: "cercania",
});
const neighbor = (personId: string, distance: number, uncertainty: number): ProximityNeighbor => ({
  personId,
  displayName: personId,
  distance,
  bearing: 0,
  uncertainty,
});

describe("nearby", () => {
  it("keeps only who the proximity engine has in range, at the distance it measured", () => {
    const near = new Map([["ana", neighbor("ana", 60, 20)]]);
    const result = nearby([encounter("ana"), encounter("beto")], near);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ person: { personId: "ana" }, distanceM: 60, inRange: true });
  });

  it("shows as zero a distance that the GPS error cannot tell apart from zero", () => {
    const [ana] = nearby([encounter("ana")], new Map([["ana", neighbor("ana", 30, 20)]]));
    expect(ana.distanceM).toBe(0);
  });
});
