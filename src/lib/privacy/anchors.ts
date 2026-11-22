import { embed } from "@/lib/embeddings";
import { cosine } from "@/lib/vector";
import type { Kind } from "@/lib/types";
import type { Finding, SensitiveCategory, TopicInput } from "./taxonomy";

// Second local layer: catches a confidence written in words the lexicon does not list
// ("sesiones con la psiquiatra"). It only raises a topic to `personal`, never blocks: this
// embedding model cannot tell living a subject from knowing it ("psiquiatra" as a trade scores
// 0.85 against "sesiones con mi psiquiatra"), and a block here could not be undone by the judge.
export const ANCHORS: Record<SensitiveCategory, string[]> = {
  salud: [
    "voy al psicólogo por mi salud mental",
    "estoy en tratamiento médico por una enfermedad",
    "tomo medicamentos para la depresión",
    "quiero quedar embarazada",
    "tengo una enfermedad crónica",
    "estoy tratando una adicción",
    "sesiones con mi psiquiatra",
    "me operaron y estoy en recuperación",
  ],
  sexualidad_genero: [
    "soy homosexual",
    "mi orientación sexual",
    "estoy en transición de género",
    "busco pareja en aplicaciones de citas",
    "voy a la marcha del orgullo gay",
  ],
  politica: [
    "milito en un partido político",
    "voto por la derecha",
    "voto por la izquierda",
    "hago campaña por un candidato",
    "soy dirigente sindical",
    "mi postura política sobre el conflicto",
  ],
  religion: [
    "voy a misa los domingos",
    "soy creyente y practico mi religión",
    "estudio la biblia en mi iglesia",
    "ayuno por motivos religiosos",
    "peregrinación religiosa",
  ],
  origen: [
    "estoy regularizando mi situación migratoria",
    "soy inmigrante sin papeles",
    "pertenezco a un pueblo originario",
    "trámite de visa y residencia para extranjeros",
  ],
  situacion_economica: [
    "estoy endeudado y no puedo pagar",
    "no me alcanza la plata a fin de mes",
    "perdí mi trabajo y estoy cesante",
    "me van a rematar la casa",
    "recibo un subsidio del estado",
  ],
  legal: [
    "tengo un juicio en tribunales",
    "me demandaron",
    "estoy imputado en una causa penal",
    "peleo la custodia y las visitas de mis hijos",
    "necesito un abogado defensor",
  ],
  menores: [
    "llevo a mi hijo al colegio",
    "mi hija pequeña va al jardín infantil",
    "soy el papá de un niño",
  ],
};

// Calibrated on eval-set.ts: at 0.66 half of the subtle sensitive cases hit and, among safe topics
// that are not expertise, only trade names next to a category do ("psicóloga").
const ANCHOR_THRESHOLD = 0.66;
const EXPERTISE: Kind[] = ["sabe", "ofrece"];

const entries = Object.entries(ANCHORS).flatMap(([category, phrases]) =>
  phrases.map((phrase) => ({ category: category as SensitiveCategory, phrase })),
);
let anchorVectors: Promise<number[][]> | undefined;

type AnchorHit = { category: SensitiveCategory; phrase: string; score: number };

async function nearestAnchors(names: string[], vectors?: number[][]): Promise<AnchorHit[]> {
  anchorVectors ??= embed(entries.map((e) => e.phrase)).catch((error) => {
    // A failed model load must not be cached: the next call has to try again.
    anchorVectors = undefined;
    throw error;
  });
  const [anchors, topics] = await Promise.all([anchorVectors, vectors ?? embed(names)]);
  return topics.map((vector) => {
    let best = { ...entries[0], score: -1 };
    anchors.forEach((anchor, i) => {
      const score = cosine(vector, anchor);
      if (score > best.score) best = { ...entries[i], score };
    });
    return best;
  });
}

// `vectors` skips the embedding call when the caller already has the topic embeddings.
export async function screenByAnchors(topics: TopicInput[], vectors?: number[][]): Promise<(Finding | null)[]> {
  const hits = await nearestAnchors(topics.map((t) => t.name), vectors);
  return hits.map((hit, i) =>
    hit.score >= ANCHOR_THRESHOLD && !EXPERTISE.includes(topics[i].kind)
      ? { level: "personal", category: hit.category, by: "ancla" }
      : null,
  );
}
