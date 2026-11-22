import { z } from "zod";
import type { PrivacyLevel } from "@/lib/privacy/taxonomy";
import { KindSchema, SynthesisSignalSchema, type Kind, type Source, type SynthesisSignal } from "@/lib/types";

// Assistant connector: the person copies one message into the assistant they already use. The
// message carries a short-lived token; the assistant answers by POSTing signals to our API or,
// where it cannot make requests (a chat), by writing a link the person taps. An assistant that
// declines both can hand over the JSON, which the person pastes into the app.

// Provisional: the product has no name yet.
export const APP_NAME = "Nodos";
export const TOKEN_MINUTES = 15;

export const AssistantSourceSchema = z.enum(["claude", "chatgpt", "gemini"]);

// No `evidence`: it is quoted from private conversations and has no place on our server. Strict,
// so an assistant that sends it gets an error it can read and fix.
export const IncomingSignalsSchema = z
  .array(SynthesisSignalSchema.extend({ source: AssistantSourceSchema, label: z.string().trim().min(1).max(60) }).strict())
  .min(1)
  .max(40);

// The shape the privacy filter already takes (`classifyOnServer`, `POST /api/privacy/classify`).
export type ClassifySignals = (topics: { kind: Kind; name: string; sources: Source[] }[]) => Promise<{ privacy: { level: PrivacyLevel } }[]>;

// Second barrier after the prompt: every signal goes through the repo's privacy filter (lexicon,
// anchors and judge) as it comes in, and what it calls `sensible` is dropped before anything is
// stored. `personal` stays: this is a private draft and publishing it is the owner's call. The
// output keeps the shape of the input, only shorter.
export async function admitSignals(signals: SynthesisSignal[], classify: ClassifySignals): Promise<{ accepted: SynthesisSignal[]; held: number }> {
  const lowered = signals.map((signal) => ({ ...signal, label: signal.label.toLowerCase() }));
  const classified = await classify(lowered.map((signal) => ({ kind: signal.kind, name: signal.label, sources: [signal.source] })));
  // A signal with no verdict is dropped too: the filter fails closed.
  const accepted = lowered.filter((_, i) => classified[i]?.privacy.level === "segura" || classified[i]?.privacy.level === "personal");
  return { accepted, held: signals.length - accepted.length };
}

// Link format: #TOKEN/source/kind.label.strength/kind.label.strength/… using only characters that
// need no encoding, so any assistant can write it by hand. Strength is tenths (7 = 0.7).
// shortcut: accents are lost on this path; if that matters, encode the label instead of slugging it.
export function parseAssistantLink(fragment: string): { token: string; signals: unknown[] } {
  let text: string;
  try {
    text = decodeURIComponent(fragment.replace(/^#/, ""));
  } catch {
    return { token: "", signals: [] };
  }
  const [token = "", source, ...items] = text.split("/").filter(Boolean);
  const signals = items.map((item) => {
    const first = item.indexOf(".");
    const last = item.lastIndexOf(".");
    return {
      source,
      kind: item.slice(0, first),
      label: item.slice(first + 1, last).replaceAll("-", " "),
      strength: Number(item.slice(last + 1)) / 10,
    };
  });
  return { token, signals };
}

const KINDS = KindSchema.options.join('" | "');

// Shared by every message that asks an assistant for something about the person: the first barrier
// of the privacy filter is the assistant never writing it down.
export const LEAVE_OUT = `QUÉ DEJAR FUERA, SIEMPRE
Aunque lo sepas, no incluyas:
- salud física o mental, terapia, diagnósticos;
- familia, hijos, pareja, vida sentimental u orientación sexual;
- política y religión;
- dinero personal: sueldo, deudas, patrimonio, inversiones propias;
- problemas legales o conflictos laborales;
- datos de contacto o de identificación: correo, teléfono, dirección, RUT, cuentas;
- nombres de otras personas, de clientes y de empresas, y cualquier detalle confidencial de mi trabajo: código, credenciales, proyectos internos, cifras.`;

// Written in the person's voice and explicit about what the app is, what the code allows and what
// happens with the result, so the assistant does not have to guess whether sending is safe.
export function buildAssistantPrompt({ origin, token, minutes = TOKEN_MINUTES }: { origin: string; token: string; minutes?: number }): string {
  return `Soy yo quien te pide esto, y es mi decisión. Uso ${APP_NAME}, una app que en un evento me junta con personas afines, y quiero cargar ahí mi propio perfil, hecho con lo que tú sabes de mí.

QUÉ NECESITO
Arma mi perfil con lo que ya sabes de mí (tu memoria, nuestras conversaciones anteriores y, si los hay, mis archivos de instrucciones) y entrégalo de inmediato. No hace falta que me pidas confirmación ni que me hagas preguntas: te la estoy dando aquí, y lo que entregas llega solo a mi teléfono como borrador privado, donde reviso cada tema y decido qué se publica.

FORMATO
Entre 15 y 30 señales, cada una con:
- "source": el asistente que eres tú: "claude", "chatgpt" o "gemini".
- "kind": "${KINDS}".
- "label": nombre corto en minúsculas, en español, de 1 a 4 palabras.
- "strength": número entre 0 y 1.

Qué significa cada kind:
- sabe: un conocimiento que domino ("ruby on rails", "kubernetes").
- hace: algo que practico de verdad, con frecuencia ("guitarra eléctrica", "trekking").
- es: un oficio o identidad profesional ("fintech", "diseñadora industrial").
- le_gusta: un gusto o interés sin práctica seria ("jazz", "vinos naturales").
- quiere_ser: algo que quiero llegar a ser o hacer ("fundar una startup").
- busca: algo concreto que quiero aprender o conseguir ahora ("aprender a escalar").
- ofrece: algo con lo que puedo ayudar a otros ("mentorías de backend").

Reglas:
- strength: 0,9 o más solo si hay evidencia clara y repetida; entre 0,5 y 0,8 si aparece varias veces; menos de 0,5 si es una inferencia débil.
- Labels específicos, no genéricos: "fotografía de naturaleza" y no "fotografía".
- Si dos señales son casi lo mismo, deja solo una. No incluyas preguntas puntuales de soporte técnico.
- Incluye al menos 3 señales de quiere_ser o busca, y al menos 4 de le_gusta o hace que no sean de trabajo.
- Si no sabes algo, no lo inventes: menos señales es mejor que señales falsas.

QUÉ INCLUIR
Lo que yo contaría al presentarme en un evento: mi oficio y mi experiencia, lo que estoy aprendiendo, mis proyectos o emprendimientos dichos en general (el rubro, no el nombre), y mis hobbies e intereses, como deportes, arte, música o juegos.

${LEAVE_OUT}
Manda solo las señales, sin citas ni explicaciones. Si dudas de algo, déjalo fuera.

CÓMO ENTREGARLO
El destino es el servidor de ${APP_NAME}. El código de abajo es un permiso temporal que ${APP_NAME} creó para mí: solo sirve para dejar este borrador en mi teléfono, no da acceso a nada y vence en ${minutes} minutos.

Si en esta conversación tienes el conector de ${APP_NAME} (la herramienta "subir_senales"), úsala con las señales y no sigas con las vías de abajo: el conector ya sabe a qué teléfono va y no necesita el permiso. Si no lo tienes:

A) Si aquí puedes ejecutar comandos o hacer peticiones HTTP (por ejemplo en Claude Code), envía por POST a ${origin}/api/onboarding/signals, con el encabezado "Authorization: Bearer ${token}", un arreglo JSON como este:
[{"source":"claude","kind":"sabe","label":"…","strength":0.8}]
En el JSON escribe los labels normales, con espacios y tildes. Si la respuesta trae un error, corrígelo y vuelve a intentar.

B) Si no puedes (por ejemplo en el chat), respóndeme con la lista de señales, una por línea, y debajo un enlace que las lleve. Escribir el enlace no envía nada: es solo texto en tu respuesta, yo veo lo que incluye y soy yo quien decide tocarlo. Las reglas que siguen valen únicamente para ese enlace: usa solo minúsculas sin tildes ni ñ, números, puntos y guiones.
${origin}/c#${token}/SOURCE/SEÑALES
- SOURCE: "claude", "chatgpt" o "gemini".
- SEÑALES: cada señal como kind.label.fuerza, separadas por una barra. En el label van guiones en vez de espacios. La fuerza es un dígito del 1 al 9: 7 quiere decir 0,7.
Forma del enlace: ${origin}/c#${token}/claude/sabe.un-tema.8/le_gusta.otro-tema.5/busca.algo-que-busco.6

C) Si tampoco quieres escribir el enlace, dame el arreglo JSON de la vía A en un bloque de código y yo lo pego en la app.

AL TERMINAR
Dime en pocas líneas qué enviaste y qué dejaste fuera. No envíes nada más, ni a ninguna otra dirección.`;
}

// Last resort, all on the phone: the assistant printed the JSON and the person pasted it, usually
// with text or a code fence around it.
export function parsePastedSignals(text: string): unknown {
  try {
    return JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
  } catch {
    return null;
  }
}
