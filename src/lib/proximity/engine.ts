// Proximity engine: each person reports a position and hears who enters, moves inside or leaves
// their radius. There is no global tick: a report recomputes only that person against the nearby
// cells of a grid, and what changed waits per recipient until someone calls flush().
// A recipient is re-sent a neighbour only when that neighbour moved; the phone discounts its own
// movement (it knows its position), so a radar can follow every GPS reading without using network.
// shortcut: one process, in memory (Render runs a single always-on instance). With more than one
// instance each room has to be pinned to one of them.

const RAD = Math.PI / 180;
const EARTH_RADIUS_M = 6_371_000;

export type EngineOptions = {
  /** Grid cell side, in metres. */
  cellSize?: number;
  /** You enter at ≤ limit and leave only at > limit × (1 + hysteresis): no flicker at the edge. */
  hysteresis?: number;
  /** How much the limit grows with the GPS accuracy of both people (0 = not at all). */
  uncertaintyFactor?: number;
  /** …but never by more than this many radii… */
  marginCapRadii?: number;
  /** …and that cap is never below this many metres: GPS error does not shrink with a small radius. */
  marginCapFloor?: number;
  /** A neighbour is re-sent when it moved more than this fraction of the distance between both. */
  moveFraction?: number;
  /** Milliseconds without reports until a position is forgotten. */
  ttlMs?: number;
  now?: () => number;
};

export type ProximityEvent<D> =
  | { type: "enter" | "move"; id: string; data: D; distance: number; bearing: number; uncertainty: number }
  | { type: "leave"; id: string };

export type ProximityListener<D> = (events: ProximityEvent<D>[]) => void;

type Person<D> = {
  id: string;
  data: D;
  radius: number;
  placed: boolean;
  x: number;
  y: number;
  cell: number;
  accuracy: number;
  seenAt: number;
  listener: ProximityListener<D> | null;
  urgent: boolean;
  /** Where each visible person was the last time this one was told. */
  sees: Map<Person<D>, [number, number]>;
  seenBy: Set<Person<D>>;
  pending: Map<string, { type: "enter" | "move" | "leave"; other: Person<D> }>;
};

/** Local plane in metres around `origin`; the error is negligible within tens of km. */
function toMeters(origin: { lat: number; lon: number }, lat: number, lon: number): [number, number] {
  return [(lon - origin.lon) * RAD * EARTH_RADIUS_M * Math.cos(origin.lat * RAD), (lat - origin.lat) * RAD * EARTH_RADIUS_M];
}

// Defaults are the variant measured for indoor GPS (±14 to ±25 m declared, real error up to twice
// that): people in range that are not shown drop from 17–31 % to under 1 %. The price is that the
// radius stops being exact: with ±20 m, "25 m" means "up to about 100 m". See README.md.
export function createProximityEngine<D = unknown>({
  cellSize = 30,
  hysteresis = 0.4,
  uncertaintyFactor = 3,
  marginCapRadii = 3,
  marginCapFloor = 75,
  moveFraction = 0.15,
  ttlMs = 60_000,
  now = Date.now,
}: EngineOptions = {}) {
  const people = new Map<string, Person<D>>();
  const grid = new Map<number, Set<Person<D>>>();
  const dirty = new Set<Person<D>>();
  let origin: { lat: number; lon: number } | null = null;
  let maxRadius = 0;

  const toCell = (value: number) => Math.floor(value / cellSize);
  const cellKey = (cx: number, cy: number) => (cx + 32768) * 65536 + cy + 32768;
  const marginCap = (radius: number) => Math.max(marginCapRadii * radius, marginCapFloor);

  function notify(viewer: Person<D>, other: Person<D>, type: "enter" | "move" | "leave") {
    const previous = viewer.pending.get(other.id)?.type;
    dirty.add(viewer);
    if (type !== "move") viewer.urgent = true;
    // What happens inside one window is merged: enter then leave is not sent; leave then back is a move.
    if (type === "leave" && previous === "enter") return void viewer.pending.delete(other.id);
    if (type === "enter" && previous === "leave") type = "move";
    else if (previous === "enter") type = "enter";
    viewer.pending.set(other.id, { type, other });
  }

  function forget(viewer: Person<D>, other: Person<D>) {
    viewer.sees.delete(other);
    other.seenBy.delete(viewer);
    notify(viewer, other, "leave");
  }

  function look(viewer: Person<D>, other: Person<D>) {
    const distance = Math.hypot(other.x - viewer.x, other.y - viewer.y);
    const last = viewer.sees.get(other);
    // With an imprecise GPS nobody can be said to be outside: the limit moves with both accuracies.
    const limit = viewer.radius + Math.min(uncertaintyFactor * Math.hypot(viewer.accuracy, other.accuracy), marginCap(viewer.radius));
    if (!last) {
      if (distance > limit) return;
      viewer.sees.set(other, [other.x, other.y]);
      other.seenBy.add(viewer);
      notify(viewer, other, "enter");
    } else if (distance > limit * (1 + hysteresis)) forget(viewer, other);
    else if (Math.hypot(other.x - last[0], other.y - last[1]) > moveFraction * distance) notify(viewer, other, "move");
  }

  function recompute(person: Person<D>) {
    for (const other of [...person.sees.keys()]) look(person, other);
    for (const viewer of [...person.seenBy]) look(viewer, person);
    const reach = Math.ceil((maxRadius + (uncertaintyFactor ? marginCap(maxRadius) : 0)) / cellSize);
    const cx = toCell(person.x);
    const cy = toCell(person.y);
    for (let i = cx - reach; i <= cx + reach; i++) {
      for (let j = cy - reach; j <= cy + reach; j++) {
        for (const other of grid.get(cellKey(i, j)) ?? []) {
          if (other === person) continue;
          if (!person.sees.has(other)) look(person, other);
          if (!other.sees.has(person)) look(other, person);
        }
      }
    }
  }

  function leaveGrid(person: Person<D>) {
    const cell = grid.get(person.cell);
    if (cell?.delete(person) && !cell.size) grid.delete(person.cell);
  }

  function dropPosition(person: Person<D>) {
    if (!person.placed) return;
    for (const other of [...person.sees.keys()]) forget(person, other);
    for (const viewer of [...person.seenBy]) forget(viewer, person);
    leaveGrid(person);
    person.placed = false;
  }

  function measureMaxRadius() {
    maxRadius = 0;
    for (const person of people.values()) maxRadius = Math.max(maxRadius, person.radius);
  }

  return {
    /** Registers someone, or changes their radius. `data` is what the others get, e.g. the name. */
    join(id: string, { radius, data }: { radius: number; data: D }) {
      let person = people.get(id);
      if (!person) {
        person = { id, data, radius, placed: false, x: 0, y: 0, cell: 0, accuracy: 0, seenAt: 0, listener: null, urgent: false, sees: new Map(), seenBy: new Set(), pending: new Map() };
        people.set(id, person);
      }
      person.radius = radius;
      person.data = data;
      measureMaxRadius();
      if (person.placed) recompute(person);
    },

    /** New position, with the GPS accuracy in metres when known. */
    update(id: string, lat: number, lon: number, accuracy = 0) {
      const person = people.get(id);
      if (!person) return;
      person.seenAt = now();
      origin ??= { lat, lon };
      const before = person.accuracy;
      const wasPlaced = person.placed;
      [person.x, person.y] = toMeters(origin, lat, lon);
      person.accuracy = accuracy;
      const cell = cellKey(toCell(person.x), toCell(person.y));
      if (!wasPlaced || cell !== person.cell) {
        if (wasPlaced) leaveGrid(person);
        const members = grid.get(cell) ?? new Set<Person<D>>();
        grid.set(cell, members.add(person));
        person.cell = cell;
        person.placed = true;
      }
      recompute(person);
      // When accuracy changes a lot, the ± each side was shown no longer holds: re-send even if nobody moved.
      if (accuracy < 0.6 * before || accuracy > 1.6 * before) {
        for (const other of person.sees.keys()) notify(person, other, "move");
        for (const viewer of person.seenBy) notify(viewer, person, "move");
      }
    },

    /** "Still here, did not move": keeps the position alive without a new reading. */
    heartbeat(id: string) {
      const person = people.get(id);
      if (person) person.seenAt = now();
    },

    leave(id: string) {
      const person = people.get(id);
      if (!person) return;
      dropPosition(person);
      people.delete(id);
      dirty.delete(person);
      measureMaxRadius();
    },

    /**
     * `listener` gets batches of events. `distance` and `bearing` (degrees from north) are relative
     * to the last position the recipient reported, at delivery time; `uncertainty` is the ± of that
     * distance. On subscribe, everyone already in range arrives as "enter" (useful on reconnect).
     */
    subscribe(id: string, listener: ProximityListener<D> | null) {
      const person = people.get(id);
      if (!person) return;
      person.listener = listener;
      person.pending.clear();
      if (listener) for (const other of person.sees.keys()) notify(person, other, "enter");
    },

    /**
     * Delivers what accumulated, one batch per person. With `all = false` only to those with an
     * enter or leave pending; people whose neighbours merely moved wait for the next full flush.
     */
    flush(all = true) {
      for (const person of [...dirty]) {
        if (!all && !person.urgent) continue;
        const batch: ProximityEvent<D>[] = [];
        for (const { type, other } of person.pending.values()) {
          if (type === "leave") {
            batch.push({ type, id: other.id });
            continue;
          }
          const dx = other.x - person.x;
          const dy = other.y - person.y;
          person.sees.set(other, [other.x, other.y]);
          batch.push({ type, id: other.id, data: other.data, distance: Math.hypot(dx, dy), bearing: (Math.atan2(dx, dy) / RAD + 360) % 360, uncertainty: Math.hypot(person.accuracy, other.accuracy) });
        }
        person.pending.clear();
        person.urgent = false;
        dirty.delete(person);
        if (person.listener && batch.length) person.listener(batch);
      }
    },

    /** Forgets positions nobody renewed. Call every few seconds. */
    sweep() {
      const limit = now() - ttlMs;
      for (const person of people.values()) if (person.seenAt < limit) dropPosition(person);
    },

    neighbors: (id: string) => [...(people.get(id)?.sees.keys() ?? [])].map((other) => other.id),
    get size() {
      return people.size;
    },
  };
}

export type ProximityEngine<D = unknown> = ReturnType<typeof createProximityEngine<D>>;
