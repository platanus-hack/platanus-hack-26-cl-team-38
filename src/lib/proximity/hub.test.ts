import { describe, expect, it } from "vitest";
import { ProximityUpdateSchema, type ProximityUpdate } from "@/lib/types";
import { createProximityHub } from "./hub";

const LAT = -33.45;
const LON = -70.65;
const M_PER_DEG = 111_194.9;
const at = (east: number, north = 0) => ({ lat: LAT + north / M_PER_DEG, lon: LON + east / (M_PER_DEG * Math.cos((LAT * Math.PI) / 180)) });
const person = (personId: string, roomId = "room-1") => ({ roomId, personId, displayName: personId, radius: 25 });

function connect(hub: ReturnType<typeof createProximityHub>, personId: string, roomId?: string) {
  const { session } = hub.join(person(personId, roomId))!;
  const updates: ProximityUpdate[] = [];
  hub.listen(session, (update) => updates.push(update));
  return { session, updates };
}

describe("createProximityHub", () => {
  it("tells two people in a room about each other, anchored to the recipient's own report", () => {
    const hub = createProximityHub();
    const ana = connect(hub, "ana");
    const beto = connect(hub, "beto");
    hub.report(ana.session, { ...at(0), accuracy: 5, stamp: 111 });
    hub.report(beto.session, { ...at(0, 10), accuracy: 5, stamp: 9 });
    hub.tick();
    expect(ana.updates).toEqual([{ anchor: 111, enter: [{ personId: "beto", displayName: "beto", distance: 10, bearing: 0, uncertainty: 7 }], move: [], leave: [] }]);
    expect(beto.updates[0].anchor).toBe(9);
    expect(beto.updates[0].enter[0]).toMatchObject({ personId: "ana", distance: 10, bearing: 180 });
  });

  it("never lets a coordinate out", () => {
    const hub = createProximityHub();
    const ana = connect(hub, "ana");
    const beto = connect(hub, "beto");
    hub.report(ana.session, { ...at(0), accuracy: 5, stamp: 1 });
    hub.report(beto.session, { ...at(12), accuracy: 5, stamp: 1 });
    hub.tick();
    for (const update of [...ana.updates, ...beto.updates]) {
      expect(ProximityUpdateSchema.safeParse(update).success).toBe(true); // strict: a field more is an error
      expect(JSON.stringify(update)).not.toMatch(/33\.4|70\.6/);
    }
  });

  it("changes the Distancia without dropping the session or the position", () => {
    const hub = createProximityHub({ engine: { uncertaintyFactor: 0 } });
    const ana = connect(hub, "ana");
    const beto = connect(hub, "beto");
    hub.report(ana.session, { ...at(0), accuracy: 5, stamp: 1 });
    hub.report(beto.session, { ...at(60), accuracy: 5, stamp: 1 });
    hub.tick();
    expect(ana.updates).toEqual([]);
    expect(hub.setRadius(ana.session, 80)).toBe(true);
    hub.tick();
    expect(ana.updates.flatMap((u) => u.enter)).toMatchObject([{ personId: "beto", distance: 60 }]);
    expect(hub.setRadius(ana.session, 1)).toBe(false);
    expect(hub.setRadius("nope", 80)).toBe(false);
  });

  it("keeps rooms apart", () => {
    const hub = createProximityHub();
    const ana = connect(hub, "ana", "room-1");
    const beto = connect(hub, "beto", "room-2");
    hub.report(ana.session, { ...at(0), accuracy: 5, stamp: 1 });
    hub.report(beto.session, { ...at(1), accuracy: 5, stamp: 1 });
    hub.tick();
    expect(ana.updates).toEqual([]);
    expect(beto.updates).toEqual([]);
    expect(hub.rooms).toBe(2);
  });

  it("starts someone who comes back from zero, and the old session stops working", () => {
    const hub = createProximityHub();
    const ana = connect(hub, "ana");
    const beto = connect(hub, "beto");
    hub.report(ana.session, { ...at(0), accuracy: 5, stamp: 1 });
    hub.report(beto.session, { ...at(10), accuracy: 5, stamp: 1 });
    hub.tick();
    const anaAgain = connect(hub, "ana"); // reload: no position yet
    hub.tick();
    expect(hub.report(ana.session, { ...at(0), accuracy: 5, stamp: 2 })).toBe(false);
    expect(beto.updates.at(-1)).toMatchObject({ leave: ["ana"] });
    expect(anaAgain.updates).toEqual([]);
    hub.report(anaAgain.session, { ...at(0), accuracy: 5, stamp: 7 });
    hub.tick();
    expect(anaAgain.updates.at(-1)).toMatchObject({ anchor: 7, enter: [{ personId: "beto", distance: 10 }] });
  });

  it("rejects what it does not understand", () => {
    const hub = createProximityHub({ maxPeoplePerRoom: 1 });
    expect(hub.join({ ...person("ana"), radius: 5000 })).toBeNull();
    expect(hub.join({ ...person("ana"), extra: true })).toBeNull();
    const ana = connect(hub, "ana");
    expect(hub.join(person("beto"))).toBeNull(); // full
    expect(hub.report(ana.session, { lat: 95, lon: 0, accuracy: 5, stamp: 1 })).toBe(false);
    expect(hub.report(ana.session, { ...at(0), accuracy: 5, stamp: 1, name: "x" })).toBe(false);
    expect(hub.report("nope", { ...at(0), accuracy: 5, stamp: 1 })).toBe(false);
    expect(hub.listen("nope", () => {})).toBeNull();
  });

  it("forgets a silent position after a minute and closes an idle session, and leave is immediate", () => {
    let now = 0;
    const hub = createProximityHub({ now: () => now });
    const ana = connect(hub, "ana");
    const beto = connect(hub, "beto");
    hub.report(ana.session, { ...at(0), accuracy: 5, stamp: 1 });
    hub.report(beto.session, { ...at(10), accuracy: 5, stamp: 1 });
    hub.tick();
    now = 50_000;
    hub.heartbeat(ana.session);
    now = 70_000; // Beto said nothing for over a minute
    hub.tick();
    expect(ana.updates.at(-1)).toMatchObject({ leave: ["beto"] });
    now = 6 * 60_000;
    hub.heartbeat(ana.session);
    hub.tick();
    expect(hub.sessions).toBe(1); // Beto's session is gone
    hub.leave(ana.session);
    expect([hub.sessions, hub.rooms]).toEqual([0, 0]);
  });
});
