import { slug } from "./node";
import { byTopic, cap, type Coincidence, coincidences, DEMO, type Encounter, RANGE } from "./people";
import type { Initiative, PhoneState } from "./store";

// An Iniciativa is the only kind of Chat: what your Agente said to the Agentes of the people you
// invited, even when it is just one person. Agentes only talk about public topics. Demo mode
// writes these on the phone; with a backend an Iniciativa is a plan (plans.ts).

/** `from` is "me" or the other person's id. */
type ConvMessage = { id: string; from: string; text: string; at: string };
export type Conversation = {
  id: string;
  /** What you set out to do, shortened. */
  theme: string;
  members: Coincidence[];
  at: string;
  messages: ConvMessage[];
};

const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;

function stamp(lines: [string, string][], start: number, idBase: string): ConvMessage[] {
  return lines.map(([from, text], i) => ({
    id: `${idBase}-${i}`,
    from,
    text,
    at: new Date(start + i * 40_000).toISOString(),
  }));
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const STOP = new Set([
  "quiero",
  "hacer",
  "para",
  "como",
  "with",
  "sobre",
  "entre",
  "este",
  "esta",
  "unos",
  "unas",
  "algo",
  "todo",
  "tener",
  "armar",
]);

/** The words of an intent worth matching against topics ("viaje", "brasil"). */
export function intentWords(intent: string): string[] {
  return [
    ...new Set(
      fold(intent)
        .split(/[^a-z0-9ñ]+/)
        .filter((w) => w.length >= 4 && !STOP.has(w)),
    ),
  ];
}

/** The public topic of theirs closest to what you want to do, if any ("viajes" for "un viaje"). */
export function relevantTopic(c: Coincidence, words: string[]): string | null {
  const stem = (w: string) => w.slice(0, Math.max(4, w.length - 2));
  const hit = c.person.topics.find((t) => {
    const name = fold(t.name);
    return words.some((w) => name.includes(stem(w)));
  });
  return hit ? cap(hit.name) : null;
}

/** "quiero hacer un viaje" → "quiere hacer un viaje", said by the Agente in third person. */
function wants(goal: string): string {
  const m = goal.match(/^(?:yo\s+)?(quiero|quisiera|me gustar[ií]a|necesito|busco|tengo que)\s+(.*)$/i);
  if (!m) return `quiere ${goal.charAt(0).toLowerCase()}${goal.slice(1)}`;
  const verb = m[1].toLowerCase();
  const third =
    verb === "necesito" ? "necesita" : verb === "busco" ? "busca" : verb === "tengo que" ? "tiene que" : "quiere";
  return `${third} ${m[2]}`;
}

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** An Iniciativa: your Agente opens with what you want, the others' Agentes answer. */
export function buildInitiative(myName: string, init: Initiative, contacts: Coincidence[]): Conversation {
  const people = init.members
    .map((id) => contacts.find((c) => c.person.personId === id))
    .filter((c): c is Coincidence => !!c);
  const words = intentWords(init.intent);
  const goal = init.intent.trim().replace(/[.!]+$/, "");
  const theme = cap(goal.length > 48 ? `${goal.slice(0, 47)}…` : goal);
  const experts = people.map((p) => ({ p, topic: relevantTopic(p, words) })).filter((x) => x.topic);

  const lines: [string, string][] = [
    [
      "me",
      `Hola a todos. Soy el Agente de ${myName}: ${wants(goal)}. ${
        experts.length
          ? `Los invité porque ${list(experts.slice(0, 2).map((x) => `${x.p.person.displayName} sabe de ${x.topic}`))}.`
          : "Los invité porque son su gente."
      }`,
    ],
  ];
  if (init.restrictions.length)
    lines.push([
      "me",
      `${myName} pidió considerar: ${list(init.restrictions.map((r) => r.charAt(0).toLowerCase() + r.slice(1)))}.`,
    ]);

  const replies = [
    (n: string) => `${n} se suma. ¿Qué día les acomoda?`,
    (n: string) => `A ${n} le interesa. Prefiere coordinar todo por acá.`,
    (n: string) => `${n} está dentro, con lo que pidió ${myName} no tiene problema.`,
    (n: string) => `${n} puede, pero esta semana tiene poco tiempo. Propone algo corto.`,
  ];
  // Each Agente answers in its own way: what they know about it, what they share with you, or a reply.
  const start = hash(init.id);
  people.slice(0, 6).forEach((p, i) => {
    const n = p.person.displayName;
    const topic = relevantTopic(p, words);
    const shared = p.items[0] ? cap(p.items[0].topic) : null;
    const text = topic
      ? `${n} sabe de ${topic} y puede ayudar a armarlo.`
      : shared && i % 2 === 0
        ? `${n} se suma; con ${myName} comparten ${shared}, así que ya tienen tema.`
        : replies[(start + i) % replies.length](n);
    lines.push([p.person.personId, text]);
  });
  const weekend = init.restrictions.some((r) => /fin(es)? de semana/i.test(r));
  lines.push([
    "me",
    `Propongo un primer paso: ${weekend ? "juntarnos este sábado" : "una llamada corta de 15 minutos esta semana"}. Les aviso cuando todos confirmen.`,
  ]);

  const messages = stamp(lines, new Date(init.at).getTime(), init.id);
  return { id: init.id, theme, members: people, at: messages[messages.length - 1].at, messages };
}

const EXAMPLES = 3;

/**
 * Your Iniciativas on this phone. In demo mode your Agente also starts one around each topic you
 * share with two or more people near you, so Chats shows how an Iniciativa reads before you make
 * your own.
 */
export function localInitiatives(s: PhoneState, encounters: Encounter[]): Initiative[] {
  const mine = s.initiatives ?? [];
  if (!DEMO) return mine;
  const examples = byTopic(coincidences({ ...s, radiusM: RANGE.max }, encounters))
    .filter((g) => g.people.length >= 2)
    .slice(0, EXAMPLES)
    .map((g): Initiative => {
      const people = g.people.slice(0, 5);
      return {
        id: `i-tema-${slug(g.topic)}`,
        intent: `Juntarse por ${cap(g.topic)}`,
        members: people.map((p) => p.person.personId),
        restrictions: [],
        at: new Date(Math.max(...people.map((p) => new Date(p.at).getTime()))).toISOString(),
      };
    });
  return [...mine, ...examples];
}
