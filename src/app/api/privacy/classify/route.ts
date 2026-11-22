import { z } from "zod";
import { classifyOnServer } from "@/lib/privacy/server";
import { KindSchema, SourceSchema } from "@/lib/types";

const BodySchema = z
  .object({
    topics: z
      .array(
        z
          .object({ kind: KindSchema, name: z.string().min(1).max(80), sources: z.array(SourceSchema).optional() })
          .strict(),
      )
      .min(1)
      .max(60),
  })
  .strict();

export async function POST(request: Request) {
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json(
      { error: "Se espera { topics: { kind, name, sources? }[] } con 1 a 60 tópicos" },
      { status: 400 },
    );

  const classified = await classifyOnServer(body.data.topics);
  return Response.json({ verdicts: classified.map((c) => c.privacy) });
}
