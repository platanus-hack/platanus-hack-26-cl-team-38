import { slug } from "./node";
import type { Coincidence, TopicGroup } from "./people";
import type { Initiative } from "./store";
import { cap, fmtDistance } from "./people";

// The log of what your Agente said to other people's Agentes: one-to-one Conversaciones, and
// group Conversaciones around a topic (its temática). Agentes only talk about public topics.
// Demo mode writes these from the Coincidencias; there is no backend that stores them yet.

/** `from` is "me" or the other person's id. */
export type ConvMessage = { id: string; from: string; text: string; at: string };
export type Conversation = {
  id: string;
  kind: "persona" | "grupo";
  /** The temática, for groups. */
  theme?: string;
  /** What kind of group: "Temática" (around a topic) or "Iniciativa" (one you started). */
  label?: string;
  members: Coincidence[];
  at: string;
  messages: ConvMessage[];
};

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

function stamp(lines: [string, string][], start: number, idBase: string): ConvMessage[] {
  return lines.map(([from, text], i) => ({ id: `${idBase}-${i}`, from, text, at: new Date(start + i * 40_000).toISOString() }));
}

export function buildConversation(myName: string, c: Coincidence): Conversation {
  const them = c.person.displayName;
  const who = c.person.personId;
  const topics = c.items.map((i) => cap(i.topic));
  const common = c.items.filter((i) => i.type === "comun").map((i) => cap(i.topic));
  const helps = c.items.find((i) => i.type === "te_ayuda");
  const helped = c.items.find((i) => i.type === "ayudas");
  const lines: [string, string][] = [
    ["me", `Hola, soy el Agente de ${myName}. Nos cruzamos en ${c.place}, ${fmtDistance(c.distanceM)}. ¿Hay Coincidencia?`],
    [
      who,
      topics.length
        ? `Hola. ${them} comparte ${c.person.topics.length} Intereses. Con ${myName} coinciden en ${list(topics)}.`
        : `Hola. ${them} comparte ${c.person.topics.length} Intereses. Con ${myName} todavía no hay uno igual.`,
    ],
  ];
  if (helps) lines.push([who, `${them} sabe de ${cap(helps.topic)}, que ${myName} busca. Le puede dar una mano.`]);
  if (helped) lines.push(["me", `Y ${myName} sabe de ${cap(helped.topic)}, que ${them} busca.`]);
  if (common.length && !helps && !helped) lines.push(["me", `A los dos les interesa ${list(common.slice(0, 2))}. Buen tema para conversar.`]);
  lines.push(["me", "Anoto la Coincidencia. Si vuelven a estar cerca, les aviso a los dos."]);
  lines.push([who, "De acuerdo. Solo usamos lo que cada uno publica."]);
  const messages = stamp(lines, new Date(c.at).getTime(), who);
  return { id: who, kind: "persona", members: [c], at: messages[messages.length - 1].at, messages };
}

/** A group around one topic: everyone you coincided with on it. */
export function buildGroup(myName: string, g: TopicGroup): Conversation {
  const theme = cap(g.topic);
  const people = g.people.slice(0, 5);
  const names = people.map((p) => p.person.displayName);
  const expert = people.find((p) => p.items.some((i) => i.topic === g.topic && i.type === "te_ayuda"));
  const seeker = people.find((p) => p.items.some((i) => i.topic === g.topic && i.type === "ayudas"));
  const lines: [string, string][] = [["me", `Hola a todos. Armé este grupo sobre ${theme}: ${list(names)} y ${myName} lo tienen en común.`]];
  if (expert) lines.push([expert.person.personId, `${expert.person.displayName} sabe de ${theme} y puede guiar a quien parte.`]);
  if (seeker) lines.push([seeker.person.personId, `${seeker.person.displayName} busca justo eso. Le sirve una conversación corta.`]);
  const rest = people.filter((p) => p !== expert && p !== seeker).slice(0, 2);
  for (const p of rest) lines.push([p.person.personId, `A ${p.person.displayName} también le interesa ${theme}. Se suma.`]);
  lines.push(["me", `Propongo juntarse los ${people.length + 1} esta semana. Les aviso cuando estén cerca.`]);
  const latest = Math.max(...people.map((p) => new Date(p.at).getTime()));
  const messages = stamp(lines, latest, `g-${slug(g.topic)}`);
  return { id: `g-${slug(g.topic)}`, kind: "grupo", theme, members: people, at: messages[messages.length - 1].at, messages };
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const STOP = new Set(["quiero", "hacer", "para", "como", "with", "sobre", "entre", "este", "esta", "unos", "unas", "algo", "todo", "tener", "armar"]);

/** The words of an intent worth matching against topics ("viaje", "brasil"). */
export function intentWords(intent: string): string[] {
  return [...new Set(fold(intent).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 4 && !STOP.has(w)))];
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
  const third = verb === "necesito" ? "necesita" : verb === "busco" ? "busca" : verb === "tengo que" ? "tiene que" : "quiere";
  return `${third} ${m[2]}`;
}

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** An Iniciativa: your Agente opens with what you want, the others' Agentes answer. */
export function buildInitiative(myName: string, init: Initiative, contacts: Coincidence[]): Conversation {
  const people = init.members.map((id) => contacts.find((c) => c.person.personId === id)).filter((c): c is Coincidence => !!c);
  const words = intentWords(init.intent);
  const goal = init.intent.trim().replace(/[.!]+$/, "");
  const theme = cap(goal.length > 48 ? `${goal.slice(0, 47)}…` : goal);
  const experts = people.map((p) => ({ p, topic: relevantTopic(p, words) })).filter((x) => x.topic);

  const lines: [string, string][] = [
    [
      "me",
      `Hola a todos. Soy el Agente de ${myName}: ${wants(goal)}. ${
        experts.length ? `Los invité porque ${list(experts.slice(0, 2).map((x) => `${x.p.person.displayName} sabe de ${x.topic}`))}.` : "Los invité porque son su gente."
      }`,
    ],
  ];
  if (init.restrictions.length) lines.push(["me", `${myName} pidió considerar: ${list(init.restrictions.map((r) => r.charAt(0).toLowerCase() + r.slice(1)))}.`]);

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
  lines.push(["me", `Propongo un primer paso: ${weekend ? "juntarnos este sábado" : "una llamada corta de 15 minutos esta semana"}. Les aviso cuando todos confirmen.`]);

  const messages = stamp(lines, new Date(init.at).getTime(), init.id);
  return { id: init.id, kind: "grupo", label: "Iniciativa", theme, members: people, at: messages[messages.length - 1].at, messages };
}

/** Every Conversación: groups (topics with two or more people) and one-to-one. */
export function allConversations(myName: string, coins: Coincidence[], groups: TopicGroup[]): Conversation[] {
  const grupos = groups.filter((g) => g.people.length >= 2).slice(0, 5).map((g) => buildGroup(myName, g));
  const personas = coins.map((c) => buildConversation(myName, c));
  return [...grupos, ...personas];
}
