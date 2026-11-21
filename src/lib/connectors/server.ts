import "server-only";
import { z } from "zod";
import { admitSignals, IncomingSignalsSchema } from "./assistant";
import { createInboxStore, type InboxStore } from "./inbox";

// One per process, shared by every onboarding route. On globalThis so a dev reload does not drop
// the inboxes that phones are still waiting on.
const holder = globalThis as typeof globalThis & { assistantInbox?: InboxStore };
export const assistantInbox = (holder.assistantInbox ??= createInboxStore());

// Shared by the two ways in (JSON from an assistant, link tapped by the person). The answer is
// plain text because an assistant reads it and may have to fix its request.
export function receiveSignals(token: string | undefined, body: unknown): Response {
  const parsed = IncomingSignalsSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(`Formato inválido. Se espera un arreglo de { source, kind, label, strength }, sin "evidence".\n${z.prettifyError(parsed.error)}`, { status: 400 });
  }
  const { accepted, held } = admitSignals(parsed.data);
  if (!token || !assistantInbox.deliver(token, accepted)) {
    return new Response("El permiso no existe o venció. Pide un mensaje nuevo en la app.", { status: 401 });
  }
  const dropped = held ? ` ${held} se descartaron por parecer datos sensibles.` : "";
  return new Response(`Recibidas ${accepted.length} señales.${dropped} Nada se publicó: quedan como borrador en el teléfono de la persona.`);
}
