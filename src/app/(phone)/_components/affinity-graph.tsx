"use client";

import { type Edge, type Entity, GraphCanvas, onEllipse, pose } from "./graph-canvas";
import { setFocus } from "./match-graph";
import { type Coincidence, type Relation, RELATION } from "../_lib/people";

// Afinidades: your contacts in three orbits by closeness. Amigos nearest, then Conocidos, then
// people who were near you. Tap someone to see what you have in common.

const ORDER: Relation[] = ["amigo", "conocido", "cercania"];
const MAX_PER_ORBIT = { amigo: 4, conocido: 6, cercania: 8 };
const SCALE = { amigo: 0.8, conocido: 0.72, cercania: 0.66 };

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
  const radius: Record<Relation, number> = { amigo: unit * 0.38, conocido: unit * 0.68, cercania: unit * 0.96 };
  const stretch = W > H ? 1.45 : 1;

  const E: Record<string, Entity> = {};
  const edges: Edge[] = [];
  E[me.id] = { kind: "person", name: "Tú", me: true, pose: pose({ x: cx, y: cy }, 1, 0.95) };

  ORDER.forEach((rel, ri) => {
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
      // Half a step off the top, so the orbit's name stays clear.
      const offset = 180 / Math.max(1, list.length) + ri * 12;
      const at = onEllipse(i, list.length, radius[rel] * stretch, radius[rel], cx, cy, -90 + offset, 270 + offset);
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
        pose: pose(at, match && !hit ? 0.18 : faded ? 0.45 : 1, isFocus ? 1 : hit ? SCALE[rel] * 1.15 : SCALE[rel]),
      };
      edges.push({
        a: me.id,
        b: id,
        kind: isFocus ? "focus" : hit ? "strong" : rel === "amigo" ? "strong" : "soft",
        o: match ? (hit ? 1 : 0.08) : c.items.length ? 1 : 0.4,
      });
    });
  });

  const under = (
    <g>
      {ORDER.map((rel) => (
        <g key={rel}>
          <ellipse className="orbit" cx={cx} cy={cy} rx={radius[rel] * stretch} ry={radius[rel]} />
          <text className="orbit-lbl" x={cx} y={cy - radius[rel] - 8} textAnchor="middle">
            {RELATION[rel].plural}
          </text>
        </g>
      ))}
    </g>
  );

  return <GraphCanvas W={W} H={H} E={E} edges={edges} under={under} onBackground={() => setFocus({ person: null })} />;
}
