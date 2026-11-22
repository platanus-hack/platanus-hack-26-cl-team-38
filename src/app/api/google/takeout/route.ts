import { z } from "zod";
import { downloadDriveFile } from "@/lib/connectors/google";
import { googleFlow, receiveTakeoutOnServer } from "@/lib/connectors/server";

const BodySchema = z.object({ pick: z.string().uuid(), fileId: z.string().regex(/^[\w-]{10,200}$/) }).strict();

// Called by the picker page with the file the person chose. The server downloads that one file
// with the token it kept for this pick, reads it, filters it and leaves the signals in the inbox
// of the phone that started the flow. `message` is shown to the person as is.
export async function POST(request: Request) {
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  const step = body.success ? googleFlow.take(body.data.pick) : null;
  if (!body.success || !step?.accessToken) return Response.json({ message: "Esta elección venció. Vuelve a Minga e intenta de nuevo." }, { status: 400 });

  const zip = await downloadDriveFile(step.accessToken, body.data.fileId).catch(() => null);
  if (!zip) return Response.json({ message: "No pudimos bajar ese archivo, o pesa más de 300 MB. Pide la exportación solo con YouTube y Calendar." }, { status: 422 });
  try {
    const { accepted, held } = await receiveTakeoutOnServer(step.owner, zip);
    if (accepted + held === 0) return Response.json({ message: "Ese archivo no trae canales de YouTube ni eventos que se repitan. Vuelve a Minga." });
    const dropped = held ? ` Dejamos fuera ${held} por ser datos sensibles.` : "";
    return Response.json({ message: `Listo: ${accepted} Intereses quedaron como borrador.${dropped} Vuelve a Minga.` });
  } catch {
    // Not a ZIP, or the privacy filter is down: nothing is kept without review.
    return Response.json({ message: "No pudimos leer ese archivo. ¿Es el .zip de Google Takeout? Vuelve a Minga e intenta de nuevo." }, { status: 422 });
  }
}
