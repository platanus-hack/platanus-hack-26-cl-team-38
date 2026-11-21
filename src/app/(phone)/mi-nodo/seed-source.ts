import { fingerprint, fold } from "@/lib/privacy/taxonomy";
import type { Kind, PersonalNode, PublicTopic, Topic, TopicPrivacy } from "@/lib/types";

// TEMPORARY stand-in for the node operations (front B, in progress elsewhere). Just enough for the
// summary screen to run on seed people; delete it when the real node module lands. Nothing is stored.

export type SeedTopic = Omit<PublicTopic, "embedding">;
export type SeedPerson = { personId: string; displayName: string; rooms: { code: string; name: string }[]; topics: SeedTopic[] };

// Every topic starts private, and `sensible` ones are dropped: they never enter the node.
export function buildNode(person: Pick<SeedPerson, "personId" | "displayName">, topics: SeedTopic[], verdicts: TopicPrivacy[]): PersonalNode {
  if (verdicts.length !== topics.length) throw new Error("Se espera un veredicto por tópico");
  return {
    personId: person.personId,
    displayName: person.displayName,
    version: 1,
    topics: topics.flatMap((t, i) =>
      verdicts[i].level === "sensible" ? [] : [{ ...t, public: false, privacy: { ...verdicts[i], decidedBy: "default" as const } }],
    ),
  };
}

const update = (node: PersonalNode, topics: Topic[]): PersonalNode => ({ ...node, version: node.version + 1, topics });
const decide = (t: Topic, shared: boolean): Topic => (t.privacy ? { ...t, public: shared, privacy: { ...t.privacy, decidedBy: "user" } } : t);

export function setShared(node: PersonalNode, topicId: string, shared: boolean): PersonalNode {
  return update(node, node.topics.map((t) => (t.id === topicId ? decide(t, shared) : t)));
}

// "Compartir los N": only recommended topics the owner has not decided on yet.
export function shareRecommended(node: PersonalNode): PersonalNode {
  return update(node, node.topics.map((t) => (t.privacy?.level === "segura" && t.privacy.decidedBy === "default" ? decide(t, true) : t)));
}

// The general version becomes a new public topic; the original stays private and nothing links them.
export function shareGeneral(node: PersonalNode, topicId: string, verdict: TopicPrivacy): PersonalNode | { error: string } {
  const original = node.topics.find((t) => t.id === topicId);
  const name = original?.privacy?.saferName;
  if (!original || !name) return { error: "Ese tópico no tiene versión general." };
  if (verdict.level === "sensible" || verdict.checkedFor !== fingerprint({ kind: original.kind, name })) {
    return { error: "Esa versión tampoco se puede compartir." };
  }
  const id = `${node.personId}.${fold(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  const general: Topic = { ...original, id, name, public: true, privacy: { ...verdict, saferName: undefined, decidedBy: "user" } };
  return update(node, [...node.topics.filter((t) => t.id !== id).map((t) => (t.id === topicId ? decide(t, false) : t)), general]);
}

// An edit needs a fresh verdict and sends the topic back to private. A `sensible` result is refused
// and the topic keeps its old name and kind.
export function editTopic(node: PersonalNode, topicId: string, change: { name: string; kind: Kind }, verdict: TopicPrivacy): PersonalNode | { error: string } {
  if (verdict.level === "sensible") return { error: "Ese nombre toca un tema que no se comparte. Quedó como estaba." };
  if (verdict.checkedFor !== fingerprint(change)) return { error: "La revisión no corresponde al cambio. Intenta de nuevo." };
  return update(
    node,
    node.topics.map((t) => (t.id === topicId ? { ...t, ...change, public: false, privacy: { ...verdict, decidedBy: "default" } } : t)),
  );
}
