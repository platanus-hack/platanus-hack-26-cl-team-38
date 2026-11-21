import { z } from "zod";
import { admitSignals, IncomingSignalsSchema, type ClassifySignals } from "./assistant";
import type { InboxStore } from "./inbox";

type Deps = { inbox: Pick<InboxStore, "has" | "deliver">; classify: ClassifySignals };

// Shared by the two ways into the backend (JSON from an assistant, link tapped by the person).
// The message is plain text because an assistant reads it and may have to fix its request.
export async function receiveSignals(token: string | undefined, body: unknown, deps: Deps): Promise<{ status: number; message: string }> {
  const expired = { status: 401, message: "El permiso no existe o venció. Pide un mensaje nuevo en la app." };
  // Before the filter: classifying calls a model, and nobody without a live token gets to spend it.
  if (!token || !deps.inbox.has(token)) return expired;

  const parsed = IncomingSignalsSchema.safeParse(body);
  if (!parsed.success) {
    return { status: 400, message: `Formato inválido. Se espera un arreglo de { source, kind, label, strength }, sin "evidence".\n${z.prettifyError(parsed.error)}` };
  }

  const { accepted, held } = await admitSignals(parsed.data, deps.classify);
  if (!deps.inbox.deliver(token, accepted)) return expired;

  const dropped = held ? ` ${held} se descartaron por ser datos sensibles.` : "";
  return { status: 200, message: `Recibidas ${accepted.length} señales.${dropped} Nada se publicó: quedan como borrador en el teléfono de la persona.` };
}
