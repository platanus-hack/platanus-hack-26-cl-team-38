import { z } from "zod";
import { TopicPrivacySchema, type Kind, type Source, type TopicPrivacy } from "@/lib/types";

// Phone side of POST /api/privacy/classify, which takes up to 60 topics per request.
const MAX_TOPICS_PER_REQUEST = 60;
const VerdictsSchema = z.object({ verdicts: z.array(TopicPrivacySchema) });

export type ClassifyInput = { kind: Kind; name: string; sources?: Source[] };

export async function fetchVerdicts(topics: ClassifyInput[]): Promise<TopicPrivacy[]> {
  const verdicts: TopicPrivacy[] = [];
  for (let i = 0; i < topics.length; i += MAX_TOPICS_PER_REQUEST) {
    const response = await fetch("/api/privacy/classify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        topics: topics.slice(i, i + MAX_TOPICS_PER_REQUEST).map(({ kind, name, sources }) => ({ kind, name, sources })),
      }),
    });
    if (!response.ok) throw new Error(`classify respondió ${response.status}`);
    verdicts.push(...VerdictsSchema.parse(await response.json()).verdicts);
  }
  if (verdicts.length !== topics.length) throw new Error("classify devolvió otra cantidad de veredictos");
  return verdicts;
}
