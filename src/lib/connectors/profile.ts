import type { z } from "zod";
import type { PrivacyLevel } from "@/lib/privacy/taxonomy";
import type { Kind, Source } from "@/lib/types";
import { APP_NAME, AssistantSourceSchema, LEAVE_OUT, TOKEN_MINUTES } from "./assistant";
import type { InboxStore } from "./inbox";

// Detailed profile: a markdown file the assistant writes about the person, one idea per bullet.
// Signals stay 1 to 4 words so they can be matched and drawn; this is the context a member agent
// needs to argue a plan.

export const PROFILE_MAX_CHARS = 12_000;
export const PROFILE_MAX_LINES = 150;

type AssistantSource = z.infer<typeof AssistantSourceSchema>;

// `judged` matters here, unlike for signals: a signal nobody reviewed is still shown to its owner
// before anything happens, while these lines go straight into an agent's context.
export type ClassifyLines = (
  topics: { kind: Kind; name: string; sources: Source[] }[],
) => Promise<{ privacy: { level: PrivacyLevel }; judged: boolean }[]>;

const HEADING = /^\s*(#{1,6})\s/;
const plain = (line: string) =>
  line
    .replace(/^\s*(?:#{1,6}|[-*+]|\d+\.)\s+/, "")
    .replace(/[*_`]/g, "")
    .trim();
const headingLevel = (line: string) => HEADING.exec(line)?.[1].length ?? 0;

function linesOf(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => !line.trimStart().startsWith("```") && plain(line) !== "");
}

// The filter reviews a line at a time, as free text (the message asks for first person, which is
// what the lexicon is written for): nothing in it counts as expertise ("es"), the
// same reading `screenText()` gives plans and citas. A line is all or nothing, never rewritten.
export async function admitProfile(
  markdown: string,
  source: AssistantSource,
  classify: ClassifyLines,
): Promise<{ markdown: string; kept: number; held: number; unreviewed: number }> {
  const lines = linesOf(markdown);
  const verdicts = await classify(lines.map((line) => ({ kind: "es", name: plain(line), sources: [source] })));

  const reviewed = lines.map((_, i) => verdicts[i]?.judged === true);
  const passes = lines.map((_, i) => reviewed[i] && verdicts[i].privacy.level !== "sensible");
  const admitted = lines.filter((_, i) => passes[i]);

  // A heading with nothing left under it would only say which subject was removed.
  const kept = admitted.filter((line, i) => {
    const level = headingLevel(line);
    if (level === 0) return true;
    for (const next of admitted.slice(i + 1)) {
      const nextLevel = headingLevel(next);
      if (nextLevel === 0) return true;
      if (nextLevel <= level) return false;
    }
    return false;
  });

  return {
    markdown: kept.map((line, i) => (i > 0 && headingLevel(line) > 0 ? `\n${line}` : line)).join("\n"),
    kept: kept.filter((line) => headingLevel(line) === 0).length,
    held: reviewed.filter((wasReviewed, i) => wasReviewed && !passes[i]).length,
    unreviewed: reviewed.filter((wasReviewed) => !wasReviewed).length,
  };
}

type Deps = { inbox: Pick<InboxStore, "has" | "deliverProfile">; classify: ClassifyLines };

// The message is plain text because an assistant reads it and may have to fix its request.
export async function receiveProfile(
  token: string | undefined,
  source: unknown,
  markdown: string,
  deps: Deps,
): Promise<{ status: number; message: string }> {
  const expired = { status: 401, message: "El permiso no existe o venció. Pide un mensaje nuevo en la app." };
  // Before the filter: classifying calls a model, and nobody without a live token gets to spend it.
  if (!token || !deps.inbox.has(token)) return expired;

  const from = AssistantSourceSchema.safeParse(source);
  if (!from.success)
    return {
      status: 400,
      message:
        "Falta decir de qué asistente viene: agrega ?source=claude, ?source=chatgpt o ?source=gemini a la dirección.",
    };
  const lines = linesOf(markdown);
  if (lines.length === 0)
    return {
      status: 400,
      message: "El archivo llegó vacío. Se espera Markdown con títulos y viñetas en el cuerpo del pedido.",
    };
  if (markdown.length > PROFILE_MAX_CHARS || lines.length > PROFILE_MAX_LINES) {
    return {
      status: 400,
      message: `El archivo es muy largo: máximo ${PROFILE_MAX_LINES} líneas y ${PROFILE_MAX_CHARS} caracteres. Resume y vuelve a enviar.`,
    };
  }

  const admitted = await admitProfile(markdown, from.data, deps.classify);
  if (admitted.kept === 0 && admitted.unreviewed > 0) {
    return {
      status: 503,
      message:
        "No pudimos revisar la privacidad del archivo ahora, así que no se guardó nada. Intenta de nuevo en un minuto.",
    };
  }
  if (!deps.inbox.deliverProfile(token, from.data, admitted.markdown)) return expired;

  const held = admitted.held
    ? ` ${admitted.held} líneas se descartaron por tocar datos sensibles: no las reescribas ni las vuelvas a enviar.`
    : "";
  const unreviewed = admitted.unreviewed ? ` ${admitted.unreviewed} no se pudieron revisar y quedaron fuera.` : "";
  return {
    status: 200,
    message: `Recibido el perfil: ${admitted.kept} líneas.${held}${unreviewed} Nada se publicó: queda como borrador en el teléfono de la persona.`,
  };
}

export function buildProfilePrompt({
  origin,
  token,
  minutes = TOKEN_MINUTES,
}: {
  origin: string;
  token: string;
  minutes?: number;
}): string {
  return `Soy yo quien te pide esto, y es mi decisión. Uso ${APP_NAME}, una app donde un agente me representa cuando planeo algo con un grupo (un viaje, una salida, un proyecto). Quiero cargar ahí un resumen detallado de mi perfil, hecho con lo que tú sabes de mí, para que ese agente proponga y negocie como lo haría yo.

QUÉ NECESITO
Un archivo Markdown llamado perfil-nodos.md, armado con lo que ya sabes de mí (tu memoria, nuestras conversaciones anteriores y, si los hay, mis archivos de instrucciones). Entrégalo de inmediato. No hace falta que me pidas confirmación ni que me hagas preguntas: te la estoy dando aquí, y el archivo llega solo a mi teléfono como borrador privado, donde lo reviso antes de que alguien más lo vea.

FORMATO
- Solo títulos con "## " y viñetas con "- ". Sin tablas, enlaces, bloques de código ni texto fuera de las viñetas.
- Una idea por viñeta, en una sola línea de hasta 200 caracteres, en español y en primera persona, como si la escribiera yo ("prefiero…", "evito…", "ya conozco…"). Sin mi nombre.
- Cada viñeta se revisa por separado y, si toca un dato sensible, se descarta entera. No mezcles dos temas en una viñeta.
- Entre 40 y 100 viñetas. Sé concreto: "prefiero hostales y moverme en bus antes que hoteles y vuelos internos" sirve; "me gusta viajar" no.
- Si no sabes algo, no lo inventes ni lo deduzcas: una sección corta es mejor que una inventada.

Usa estas secciones, en este orden, y omite la que quede vacía:
## Oficio y experiencia
## Lo que sé y puedo enseñar
## Proyectos e intereses actuales
## Hobbies y tiempo libre
## Viajes
## Comida y bebida
## Música, cine, lectura y juegos
## Cómo planeo y decido en grupo
## Lo que evito o no me gusta
## Lo que busco o quiero aprender

En Viajes: mi estilo de viaje, el ritmo que prefiero, qué tipo de lugares y actividades busco y qué países o regiones ya conozco. En Cómo planeo y decido: si organizo o me sumo, cuánto planifico, qué me hace ceder y qué no negocio.

${LEAVE_OUT}
Tampoco fechas ni lugares exactos: ni dónde vivo, ni cuándo viajo, ni dónde estaré. Sin citas textuales de nuestras conversaciones. Si dudas de algo, déjalo fuera.

CÓMO ENTREGARLO
El destino es el servidor de ${APP_NAME}. El código de abajo es un permiso temporal que ${APP_NAME} creó para mí: solo sirve para dejar este borrador en mi teléfono, no da acceso a nada y vence en ${minutes} minutos.

Si en esta conversación tienes el conector de ${APP_NAME} (la herramienta "subir_perfil"), úsala con el asistente que eres y el contenido del archivo, y no sigas con las vías de abajo: el conector ya sabe a qué teléfono va y no necesita el permiso. Si no lo tienes:

A) Si aquí puedes ejecutar comandos (por ejemplo en Claude Code), guarda el archivo y súbelo así, cambiando "claude" por el asistente que eres ("claude", "chatgpt" o "gemini"):
curl -X POST "${origin}/api/onboarding/profile?source=claude" -H "Authorization: Bearer ${token}" -H "Content-Type: text/markdown" --data-binary @perfil-nodos.md
La respuesta dice cuántas líneas se recibieron y cuántas descartó el filtro de privacidad. Si trae un error de formato, corrígelo y vuelve a intentar. Las líneas descartadas no las reescribas ni las vuelvas a enviar: se quedan fuera.

B) Si no puedes (por ejemplo en el chat), crea perfil-nodos.md como archivo descargable. Si tampoco puedes crear archivos, escribe el contenido completo en un solo bloque de código. Yo lo subo en la app.

AL TERMINAR
Dime en pocas líneas qué secciones incluiste y qué dejaste fuera. No envíes el archivo a ninguna otra dirección.`;
}
