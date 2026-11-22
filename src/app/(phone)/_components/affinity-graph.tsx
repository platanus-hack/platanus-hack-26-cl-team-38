"use client";

import { type Edge, type Entity, GraphCanvas, onEllipse, pose } from "./graph-canvas";
import { setFocus } from "./match-graph";
import { type Coincidence, firstName } from "../_lib/people";

// Contactos: the stronger the relation, the closer to you. Strength is being an Amigo plus how
// much you have in common; the size of each circle is what you have in common. Tap someone to see
// it; drag them and they spring back to their place.

const MAX = 14;
/** Circle size from nothing in common to the most in common among your contacts. */
const SIZE = { min: 0.5, max: 1 };
/** Each next person turns by the golden angle, so neighbors in strength never pile up. */
const TURN = 137.5;

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
  const stretch = W > H ? 1.45 : 1;

  const E: Record<string, Entity> = {};
  const edges: Edge[] = [];
  E[me.id] = { kind: "person", name: "Tú", me: true, pose: pose({ x: cx, y: cy }, 1, 0.95) };
  // Affinity level: shared topics, and more when one can help the other (see matchTopics).
  const top = Math.max(1, ...contacts.map((c) => c.score));
  const level = (c: Coincidence) => (c.score ? Math.sqrt(c.score / top) : 0);

  const strength = (c: Coincidence) => (c.relation === "amigo" ? 0.5 : 0) + 0.5 * level(c);
  const sorted = [...contacts].sort((x, y) => strength(y) - strength(x));
  // Everyone keeps their seat while you search; someone with the topic who had no seat takes the
  // last one held by someone without it.
  const list = sorted.slice(0, MAX);
  if (match) {
    const waiting = sorted.slice(MAX).filter((c) => match.has(c.person.personId));
    for (let i = list.length - 1; i >= 0 && waiting.length; i--)
      if (!match.has(list[i].person.personId)) list[i] = waiting.shift()!;
  }
  list.forEach((c, i) => {
    const id = `p:${c.person.personId}`;
    const rel = c.relation;
    // By rank, not by raw strength: many contacts tie, and a spiral keeps them apart while the
    // stronger one still sits closer.
    const r = unit * (0.48 + 0.49 * Math.sqrt(list.length > 1 ? i / (list.length - 1) : 0));
    const deg = -90 + i * TURN;
    const at = onEllipse(0, 1, r * stretch, r, cx, cy, deg, deg);
    const lv = level(c);
    const size = c.score ? SIZE.min + 0.1 + (SIZE.max - SIZE.min - 0.1) * lv : SIZE.min;
    const isFocus = focus === c.person.personId;
    const hit = match?.has(c.person.personId);
    const faded = (focus && !isFocus) || (match && !hit);
    E[id] = {
      kind: "person",
      name: firstName(c.person.displayName),
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

  return <GraphCanvas W={W} H={H} E={E} edges={edges} onBackground={() => setFocus({ person: null })} draggable />;
}
