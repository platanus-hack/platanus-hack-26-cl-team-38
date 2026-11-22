import { z } from "zod";
import { embed } from "@/lib/embeddings";

const BodySchema = z.object({ texts: z.array(z.string().min(1).max(200)).min(1).max(100) });

export async function POST(request: Request) {
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "Se espera { texts: string[] } con 1 a 100 textos" }, { status: 400 });

  return Response.json({ embeddings: await embed(body.data.texts) });
}
