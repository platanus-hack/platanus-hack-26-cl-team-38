import { projectNode } from "@/lib/privacy/projection";
import { fingerprint, fold } from "@/lib/privacy/taxonomy";
import type { Kind, PersonalNode, PublicTopic, Signal, Topic, TopicPrivacy } from "@/lib/types";
import { synthesizeTopics } from "./synthesize";

// Node operations on the phone. Nothing here talks to the network: verdicts come from
// POST /api/privacy/classify and are passed in.

export type DraftTopic = Omit<PublicTopic, "embedding">;
type Person = Pick<PersonalNode, "personId" | "displayName">;

export const idFor = (personId: string, name: string) =>
  `${personId}.${fold(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;

export function draftsFromSignals(personId: string, signals: Signal[]): DraftTopic[] {
  const taken = new Set<string>();
  return synthesizeTopics(signals).map((topic) => {
    let id = idFor(personId, topic.name);
    // "c++" and "c#" fold to the same slug.
    for (let n = 2; taken.has(id); n++) id = `${idFor(personId, topic.name)}-${n}`;
    taken.add(id);
    return { id, ...topic };
  });
}

// Every topic starts private, and `sensible` ones are dropped: they never enter the node.
export function buildNode(person: Person, topics: DraftTopic[], verdicts: TopicPrivacy[]): PersonalNode {
  if (verdicts.length !== topics.length) throw new Error("Se espera un veredicto por tópico");
  return {
    personId: person.personId,
    displayName: person.displayName,
    version: 1,
    topics: topics.flatMap((t, i) =>
      verdicts[i].level === "sensible"
        ? []
        : [{ ...t, public: false, privacy: { ...verdicts[i], decidedBy: "default" as const } }],
    ),
  };
}

const update = (node: PersonalNode, topics: Topic[]): PersonalNode => ({ ...node, version: node.version + 1, topics });
const decide = (t: Topic, shared: boolean): Topic =>
  t.privacy ? { ...t, public: shared, privacy: { ...t.privacy, decidedBy: "user" } } : t;

// Drafts the node already has a current verdict for. The rest need one before reconcile().
export function needsVerdict(node: PersonalNode | undefined, drafts: DraftTopic[]): DraftTopic[] {
  const known = new Map(node?.topics.map((t) => [t.id, t]) ?? []);
  return drafts.filter((d) => known.get(d.id)?.privacy?.checkedFor !== fingerprint(d));
}

// New signals arrived or some were removed: the node follows the drafts, keeping every decision the
// owner already made. Depth and sources may change (another assistant corroborates); privacy does not,
// because the verdict covers only kind and name.
export function reconcile(
  node: PersonalNode | undefined,
  person: Person,
  drafts: DraftTopic[],
  fresh: { draft: DraftTopic; verdict: TopicPrivacy }[],
): PersonalNode {
  const known = new Map(node?.topics.map((t) => [t.id, t]) ?? []);
  const verdicts = new Map(fresh.map(({ draft, verdict }) => [draft.id, verdict]));
  const topics = drafts.flatMap((draft): Topic[] => {
    const verdict = verdicts.get(draft.id);
    if (verdict)
      return verdict.level === "sensible"
        ? []
        : [{ ...draft, public: false, privacy: { ...verdict, decidedBy: "default" } }];
    const kept = known.get(draft.id);
    return kept?.privacy?.checkedFor === fingerprint(draft)
      ? [{ ...kept, depth: draft.depth, sources: draft.sources }]
      : [];
  });
  return { personId: person.personId, displayName: person.displayName, version: (node?.version ?? 0) + 1, topics };
}

export function setShared(node: PersonalNode, topicId: string, shared: boolean): PersonalNode {
  return update(
    node,
    node.topics.map((t) => (t.id === topicId ? decide(t, shared) : t)),
  );
}

// "Compartir los N": only recommended topics the owner has not decided on yet.
export function shareRecommended(node: PersonalNode): PersonalNode {
  return update(
    node,
    node.topics.map((t) => (t.privacy?.level === "segura" && t.privacy.decidedBy === "default" ? decide(t, true) : t)),
  );
}

// The general version becomes a new public topic; the original stays private and nothing links them.
export function shareGeneral(
  node: PersonalNode,
  topicId: string,
  verdict: TopicPrivacy,
): PersonalNode | { error: string } {
  const original = node.topics.find((t) => t.id === topicId);
  const name = original?.privacy?.saferName;
  if (!original || !name) return { error: "Ese tópico no tiene versión general." };
  if (verdict.level === "sensible" || verdict.checkedFor !== fingerprint({ kind: original.kind, name })) {
    return { error: "Esa versión tampoco se puede compartir." };
  }
  const id = idFor(node.personId, name);
  const general: Topic = {
    ...original,
    id,
    name,
    public: true,
    privacy: { ...verdict, saferName: undefined, decidedBy: "user" },
  };
  return update(node, [
    ...node.topics.filter((t) => t.id !== id).map((t) => (t.id === topicId ? decide(t, false) : t)),
    general,
  ]);
}

// An edit needs a fresh verdict and sends the topic back to private. A `sensible` result is refused
// and the topic keeps its old name and kind.
export function editTopic(
  node: PersonalNode,
  topicId: string,
  change: { name: string; kind: Kind },
  verdict: TopicPrivacy,
): PersonalNode | { error: string } {
  if (verdict.level === "sensible") return { error: "Ese nombre toca un tema que no se comparte. Quedó como estaba." };
  if (verdict.checkedFor !== fingerprint(change))
    return { error: "La revisión no corresponde al cambio. Intenta de nuevo." };
  return update(
    node,
    node.topics.map((t) =>
      t.id === topicId ? { ...t, ...change, public: false, privacy: { ...verdict, decidedBy: "default" } } : t,
    ),
  );
}

export function checkInBody(node: PersonalNode, roomCode: string) {
  const { projection } = projectNode({ ...node, topics: node.topics.filter((t) => t.privacy?.level !== "sensible") });
  return {
    roomCode,
    personId: projection.personId,
    displayName: projection.displayName,
    // The server computes embeddings at check-in and rejects any extra field.
    topics: projection.topics.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      depth: t.depth,
      sources: t.sources,
    })),
  };
}
