import { describe, expect, it } from "vitest";
import { createProximityEngine, type EngineOptions, type ProximityEvent } from "./engine";

// A made-up point in Santiago; `at(east, north)` is that many metres away from it.
const LAT = -33.45;
const LON = -70.65;
const M_PER_DEG = 111_194.9;
const at = (east: number, north = 0): [number, number] => [LAT + north / M_PER_DEG, LON + east / (M_PER_DEG * Math.cos((LAT * Math.PI) / 180))];

// No uncertainty margin unless a test asks for it, so limits are the plain radius.
const EXACT: EngineOptions = { uncertaintyFactor: 0, hysteresis: 0.2, moveFraction: 0.3 };

function setup(people: [id: string, radius: number][], options: EngineOptions = EXACT) {
  const engine = createProximityEngine<string>(options);
  const received: Record<string, ProximityEvent<string>[]> = {};
  for (const [id, radius] of people) {
    engine.join(id, { radius, data: id });
    engine.subscribe(id, (events) => (received[id] ??= []).push(...events));
  }
  const put = (id: string, east: number, north = 0, accuracy = 0) => {
    engine.update(id, ...at(east, north), accuracy);
    engine.flush();
  };
  const seen = (id: string) => (received[id] ?? []).map((event) => `${event.type}:${event.id}`).join();
  const last = (id: string) => received[id]?.at(-1);
  return { engine, put, seen, last };
}

describe("createProximityEngine", () => {
  it("tells each side who is inside its radius, with distance and bearing", () => {
    const { put, seen, last } = setup([["ana", 25], ["beto", 25], ["caro", 25]]);
    put("ana", 0);
    put("beto", 20);
    put("caro", 100);
    expect(seen("ana")).toBe("enter:beto");
    expect(seen("beto")).toBe("enter:ana");
    expect(seen("caro")).toBe("");
    const beto = last("ana");
    expect(beto?.type === "enter" && [Math.round(beto.distance), Math.round(beto.bearing)]).toEqual([20, 90]); // east of Ana
    const ana = last("beto");
    expect(ana?.type === "enter" && Math.round(ana.bearing)).toBe(270);
  });

  it("moves the radius with the person", () => {
    const { put, seen } = setup([["ana", 25], ["caro", 25]]);
    put("ana", 0, 0);
    put("caro", 0, 100);
    expect(seen("ana")).toBe("");
    put("ana", 0, 80);
    expect(seen("ana")).toBe("enter:caro");
    expect(seen("caro")).toBe("enter:ana");
    put("ana", 0, 0);
    expect(seen("ana")).toBe("enter:caro,leave:caro");
  });

  it("enters at the radius, leaves only past the hysteresis, and does not flicker in between", () => {
    const { engine, put, seen } = setup([["ana", 25], ["beto", 25]]);
    put("ana", 0);
    put("beto", 25.5);
    expect(seen("ana")).toBe("");
    put("beto", 24.5);
    expect(seen("ana")).toBe("enter:beto");
    for (const distance of [26, 24, 27, 29.5, 23, 28]) put("beto", distance); // GPS noise around the edge
    expect(seen("ana")).not.toContain("leave");
    expect(seen("ana").match(/enter/g)).toHaveLength(1);
    put("beto", 30.5); // 25 × 1.2 = 30
    expect(seen("ana").endsWith("leave:beto")).toBe(true);
    put("beto", 27);
    expect(seen("ana").endsWith("leave:beto")).toBe(true); // coming back needs ≤ 25 m
    expect(engine.neighbors("ana")).toEqual([]);
  });

  it("widens the limit with the accuracy of both, up to the cap and never below its floor", () => {
    const options: EngineOptions = { uncertaintyFactor: 3, marginCapRadii: 3, marginCapFloor: 75, hysteresis: 0 };
    // ±20 m each: 3 × hypot(20, 20) = 85 m of margin, capped at max(3 × 25, 75) = 75 → limit 100 m.
    const wide = setup([["ana", 25], ["beto", 25]], options);
    wide.put("ana", 0, 0, 20);
    wide.put("beto", 101, 0, 20);
    expect(wide.seen("ana")).toBe("");
    wide.put("beto", 99, 0, 20);
    expect(wide.seen("ana")).toBe("enter:beto");
    // A 10 m radius keeps the 75 m floor: the GPS is not better because the radius is small.
    const small = setup([["ana", 10], ["beto", 10]], options);
    small.put("ana", 0, 0, 20);
    small.put("beto", 80, 0, 20);
    expect(small.seen("ana")).toBe("enter:beto");
    // With a precise GPS the margin is small and the radius means what it says.
    const precise = setup([["ana", 25], ["beto", 25]], options);
    precise.put("ana", 0, 0, 2);
    precise.put("beto", 40, 0, 2);
    expect(precise.seen("ana")).toBe("");
  });

  it("gives each person their own radius", () => {
    const { put, seen } = setup([["ana", 50], ["beto", 10]]);
    put("ana", 0);
    put("beto", 30);
    expect(seen("ana")).toBe("enter:beto");
    expect(seen("beto")).toBe("");
  });

  it("merges what happens inside one delivery window", () => {
    const { engine, seen } = setup([["ana", 25], ["beto", 25]]);
    engine.update("ana", ...at(0));
    engine.update("beto", ...at(10));
    engine.update("beto", ...at(200)); // in and out before anyone was told
    engine.flush();
    expect(seen("ana")).toBe("");
  });

  it("re-sends the uncertainty to both sides when someone's accuracy improves a lot", () => {
    const { put, last } = setup([["ana", 25], ["beto", 25]], { uncertaintyFactor: 1 });
    put("ana", 0, 0, 60);
    put("beto", 10, 0, 20);
    put("ana", 0, 0, 20); // same place, precise reading
    for (const id of ["ana", "beto"]) {
      const event = last(id);
      expect(event?.type === "move" && Math.round(event.uncertainty)).toBe(28);
    }
  });

  it("forgets a position without reports, keeps it with heartbeats, and tells at once on leave", () => {
    let now = 0;
    const { engine, put, seen } = setup([["ana", 25], ["beto", 25]], { ...EXACT, ttlMs: 60_000, now: () => now });
    put("ana", 0);
    put("beto", 10);
    now = 50_000;
    engine.heartbeat("ana");
    engine.heartbeat("beto");
    now = 100_000;
    engine.sweep();
    engine.flush();
    expect(seen("ana")).toBe("enter:beto");
    now = 170_000; // nobody renewed
    engine.sweep();
    engine.flush();
    expect(seen("ana")).toBe("enter:beto,leave:beto");
    put("ana", 0);
    put("beto", 10);
    engine.leave("beto");
    engine.flush();
    expect(seen("ana")).toBe("enter:beto,leave:beto,enter:beto,leave:beto");
  });

  it("sends everyone already in range again when someone subscribes (reconnect)", () => {
    const { engine, put } = setup([["ana", 25], ["beto", 25]]);
    put("ana", 0);
    put("beto", 10);
    const again: string[] = [];
    engine.subscribe("ana", (events) => again.push(...events.map((event) => `${event.type}:${event.id}`)));
    engine.flush();
    expect(again).toEqual(["enter:beto"]);
  });
});
