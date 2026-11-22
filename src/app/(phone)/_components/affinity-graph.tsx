"use client";

import { type Edge, type Entity, GraphCanvas, onEllipse, pose } from "./graph-canvas";
import { setFocus } from "./match-graph";
import { type Coincidence, type Relation, RELATION } from "../_lib/people";

// Afinidades: your contacts in three orbits by closeness. Amigos nearest, then Conocidos, then
// people who were near you. The size of each circle is how much you have in common. Tap someone
// to see it; drag them and they spring back to their orbit.

const ORDER: Relation[] = ["amigo", "conocido", "cercania"];
const MAX_PER_ORBIT = { amigo: 4, conocido: 6, cercania: 8 };
/** Circle size from nothing in common to the most in common among your contacts. */
const SIZE = { min: 0.5, max: 1 };

/** Degrees left free on each side of the top of an orbit, so its name sits on the line clear of people. */
const gapFor = (r: number) => (((30 + 20) / r) * 180) / Math.PI;

export function AffinityGraph({
  W,
  H,
  me,
  contacts,
  focus,
  match = null,
}: {
  W: number;
  H: number;
  me: { id: string };
  contacts: Coincidence[];
  focus: string | null;
  /** While searching: the people with that topic; everyone else fades. */
  match?: Set<string> | null;
}) {
  const cx = W / 2;
  const cy = H / 2;
  const unit = Math.min(W, H) / 2 - 24;
  const radius: Record<Relation, number> = { amigo: unit * 0.42, conocido: unit * 0.7, cercania: unit * 0.97 };
  const stretch = W > H ? 1.45 : 1;

  const E: Record<string, Entity> = {};
  const edges: Edge[] = [];
  E[me.id] = { kind: "person", name: "Tú", me: true, pose: pose({ x: cx, y: cy }, 1, 0.95) };
  // Affinity level: shared topics, and more when one can help the other (see matchTopics).
  const top = Math.max(1, ...contacts.map((c) => c.score));
  const level = (c: Coincidence) => (c.score ? Math.sqrt(c.score / top) : 0);

  ORDER.forEach((rel) => {
    // Everyone keeps their seat while you search; someone with the topic who had no seat takes
    // the last one held by someone without it.
    const inOrbit = contacts.filter((c) => c.relation === rel);
    const list = inOrbit.slice(0, MAX_PER_ORBIT[rel]);
    if (match) {
      const waiting = inOrbit.slice(MAX_PER_ORBIT[rel]).filter((c) => match.has(c.person.personId));
      for (let i = list.length - 1; i >= 0 && waiting.length; i--) if (!match.has(list[i].person.personId)) list[i] = waiting.shift()!;
    }
    list.forEach((c, i) => {
      const id = `p:${c.person.personId}`;
      // Centered slots around the orbit, leaving the top free for its name. Orbits hold different
      // counts, so their slots fall between each other's.
      const gap = gapFor(radius[rel]);
      const deg = -90 + gap + ((360 - 2 * gap) * (i + 0.5)) / list.length;
      const at = onEllipse(0, 1, radius[rel] * stretch, radius[rel], cx, cy, deg, deg);
      const lv = level(c);
      const size = c.score ? SIZE.min + 0.1 + (SIZE.max - SIZE.min - 0.1) * lv : SIZE.min;
      const isFocus = focus === c.person.personId;
      const hit = match?.has(c.person.personId);
      const faded = (focus && !isFocus) || (match && !hit);
      E[id] = {
        kind: "person",
        name: c.person.displayName,
        avatar: c.person.personId,
        tone: rel,
        focus: isFocus,
        onClick: () => setFocus({ person: c.person.personId }),
        from: me.id,
        pose: pose(at, match && !hit ? 0.18 : faded ? 0.45 : 1, isFocus ? Math.max(1, size) : hit ? size * 1.1 : size),
      };
      edges.push({
        a: me.id,
        b: id,
        kind: isFocus ? "focus" : hit ? "strong" : rel === "amigo" ? "strong" : "soft",
        w: 1 + 2 * lv,
        o: match ? (hit ? 1 : 0.08) : c.items.length ? 0.5 + 0.5 * lv : 0.3,
      });
    });
  });

  const under = (
    <g>
      {ORDER.map((rel) => (
        <g key={rel}>
          <ellipse className={`orbit ${rel}`} cx={cx} cy={cy} rx={radius[rel] * stretch} ry={radius[rel]} />
          <text className={`orbit-lbl ${rel}`} x={cx} y={cy - radius[rel] + 4} textAnchor="middle">
            {RELATION[rel].plural}
          </text>
        </g>
      ))}
    </g>
  );

  return <GraphCanvas W={W} H={H} E={E} edges={edges} under={under} onBackground={() => setFocus({ person: null })} draggable />;
}
