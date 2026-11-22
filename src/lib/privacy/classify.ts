import type { TopicPrivacy } from "@/lib/types";
import { screenByAnchors } from "./anchors";
import type { Judge, JudgeInput } from "./judge";
import { screen } from "./screen";
import { CATEGORY_LABELS, fingerprint, reasonFor, strictest, type Finding, type PrivacyCategory } from "./taxonomy";

export type Classified = {
  privacy: TopicPrivacy;
  // Which layer set the level; "sin_juez" when the judge did not answer and the topic was held back.
  by: Finding["by"] | "sin_juez" | null;
  // False when no judge answered for this topic: its level is a holding position, not a verdict.
  judged: boolean;
};

// Topics are 1 to 4 words. Anything this long is free text nobody reviewed as a topic.
const MAX_NAME_LENGTH = 60;

export async function classifyTopics(
  topics: JudgeInput[],
  options: { judge?: Judge; vectors?: number[][] } = {},
): Promise<Classified[]> {
  const blocked = topics.map((t) => screen(t));
  // What the deterministic layer blocks is never sent to a model.
  const pending = topics.flatMap((t, i) => (blocked[i] ? [] : [i]));
  const pendingTopics = pending.map((i) => topics[i]);

  const [verdicts, anchors] = await Promise.all([
    options.judge ? options.judge(pendingTopics).catch(() => null) : null,
    pendingTopics.length === 0
      ? []
      : screenByAnchors(pendingTopics, options.vectors && pending.map((i) => options.vectors![i])).catch(() => null),
  ]);

  const results: Classified[] = topics.map((topic, i) => ({
    privacy: {
      level: "sensible",
      category: blocked[i]?.category,
      reason:
        blocked[i]?.by === "patron"
          ? "Contiene un dato de contacto."
          : blocked[i]
            ? reasonFor(blocked[i].category)
            : undefined,
      checkedFor: fingerprint(topic),
      decidedBy: "default",
    },
    by: blocked[i]?.by ?? null,
    judged: true,
  }));

  pending.forEach((topicIndex, j) => {
    const topic = topics[topicIndex];
    const verdict = verdicts?.[j] ?? null;
    const local = localFinding(topic.name, anchors === null ? "failed" : anchors[j]);

    const level = strictest(verdict?.level ?? "personal", local ? "personal" : "segura");
    // With no verdict or a passing one, a local finding is what explains the level.
    const localDecides = local !== null && (verdict === null || verdict.level === "segura");
    // A suggested general version is only worth showing if it would itself get through.
    const saferName =
      verdict?.saferName && !screen({ kind: topic.kind, name: verdict.saferName }) ? verdict.saferName : undefined;

    results[topicIndex] = {
      privacy: {
        level,
        category: localDecides ? local.category : verdict?.category,
        reason: localDecides
          ? local.reason
          : !verdict
            ? "No pudimos revisarlo ahora, así que decides tú."
            : level === "segura"
              ? undefined
              : reasonFor(verdict.category),
        saferName: level === "personal" ? saferName : undefined,
        checkedFor: fingerprint(topic),
        decidedBy: "default",
      },
      by: localDecides ? local.by : !verdict ? "sin_juez" : level === "segura" ? null : "juez",
      judged: verdict !== null && anchors !== null,
    };
  });

  return results;
}

const CACHE_LIMIT = 5000;

// The judge is not deterministic. Remembering its answer per (kind, name, sources) means asking
// again cannot turn a blocked topic into a passing one, and a check-in right after onboarding
// costs no model call. Keys carry no person id; nothing is written to disk.
export function createCachedClassifier(judge: Judge | undefined) {
  const cache = new Map<string, Classified>();
  const keyOf = (t: JudgeInput) => `${fingerprint(t)}|${[...(t.sources ?? [])].sort().join(",")}`;

  return async (topics: JudgeInput[], options: { vectors?: number[][] } = {}): Promise<Classified[]> => {
    const missing = topics.flatMap((t, i) => (cache.has(keyOf(t)) ? [] : [i]));
    const fresh = await classifyTopics(
      missing.map((i) => topics[i]),
      { judge, vectors: options.vectors && missing.map((i) => options.vectors![i]) },
    );
    const freshByIndex = new Map(missing.map((i, j) => [i, fresh[j]]));
    for (const [i, result] of freshByIndex) {
      if (!result.judged) continue;
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      cache.set(keyOf(topics[i]), result);
    }
    return topics.map((t, i) => freshByIndex.get(i) ?? cache.get(keyOf(t))!);
  };
}

function localFinding(
  name: string,
  anchor: Finding | null | "failed",
): { by: "ancla" | "patron"; category?: PrivacyCategory; reason: string } | null {
  if (anchor === "failed")
    return { by: "ancla", reason: "No pudimos compararlo con los temas sensibles, así que decides tú." };
  if (anchor)
    return {
      by: "ancla",
      category: anchor.category,
      reason: `Se parece a un tema de ${CATEGORY_LABELS[anchor.category]}.`,
    };
  if (name.length > MAX_NAME_LENGTH)
    return { by: "patron", category: "unico", reason: "Es muy largo para ser un tópico: revisa que no diga de más." };
  return null;
}
