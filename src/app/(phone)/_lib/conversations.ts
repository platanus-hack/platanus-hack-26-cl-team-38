import { slug } from "./node";
import type { Coincidence, TopicGroup } from "./people";
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
    [who, `Hola. ${them} comparte ${c.person.topics.length} Intereses. Con ${myName} coinciden en ${list(topics)}.`],
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

/** Every Conversación: groups (topics with two or more people) and one-to-one. */
export function allConversations(myName: string, coins: Coincidence[], groups: TopicGroup[]): Conversation[] {
  const grupos = groups.filter((g) => g.people.length >= 2).slice(0, 5).map((g) => buildGroup(myName, g));
  const personas = coins.map((c) => buildConversation(myName, c));
  return [...grupos, ...personas];
}
