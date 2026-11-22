import { z } from "zod";
import { PublicProjectionSchema, PublicTopicSchema, type PublicProjection } from "@/lib/types";
import type { Classified } from "./classify";
import type { JudgeInput } from "./judge";
import { hasIdentifier } from "./screen";

// Strict on purpose: a phone that sends `privacy`, `evidence` or an intent gets an error, not a silent drop.
export const CheckInSchema = z
  .object({
    roomCode: z.string().min(1).max(40),
    personId: z.string().min(1).max(80),
    displayName: z.string().min(1).max(40),
    topics: z
      .array(
        PublicTopicSchema.omit({ embedding: true })
          .extend({ name: z.string().min(1).max(80) })
          .strict(),
      )
      .max(60),
  })
  .strict();

export type CheckInRejection = { topicId: string; reason: "sensible" | "sin_revisar" };

type Deps = {
  classify: (topics: JudgeInput[], options: { vectors?: number[][] }) => Promise<Classified[]>;
  embed: (texts: string[]) => Promise<number[][]>;
};

// The room trusts no phone: whatever a client claims about its topics, the server classifies them
// again and admits only what has a verdict that is not `sensible`. `personal` passes because
// publishing it is the owner's call, and the owner is who is asking.
export async function admitCheckIn(
  body: unknown,
  deps: Deps,
): Promise<
  | { ok: false; error: string }
  | { ok: true; roomCode: string; projection: PublicProjection; rejected: CheckInRejection[] }
> {
  const parsed = CheckInSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const { roomCode, personId, displayName, topics } = parsed.data;
  if (hasIdentifier(displayName)) return { ok: false, error: "displayName no puede llevar un dato de contacto" };

  const vectors = await deps.embed(topics.map((t) => t.name));
  const classified = await deps.classify(topics, { vectors });

  const rejected: CheckInRejection[] = [];
  const admitted = topics.flatMap((topic, i) => {
    const { privacy, judged } = classified[i];
    if (privacy.level === "sensible") rejected.push({ topicId: topic.id, reason: "sensible" });
    else if (!judged) rejected.push({ topicId: topic.id, reason: "sin_revisar" });
    else return [{ ...topic, embedding: vectors[i] }];
    return [];
  });

  return {
    ok: true,
    roomCode,
    projection: PublicProjectionSchema.parse({ personId, displayName, topics: admitted }),
    rejected,
  };
}
