import type { FeatureExtractionPipeline } from "@huggingface/transformers";

// Multilingual paraphrase model: unrelated Spanish topics land below ~0.3 cosine, so the
// 0.60 theme threshold separates them. gte-small and multilingual-e5 put unrelated pairs
// at ~0.75, which would merge every topic into one theme.
export const EMBEDDING_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
// Seed embeddings were computed with q8; mixing dtypes shifts cosines slightly.
const EMBEDDING_DTYPE = "q8";
export const EMBEDDING_DIM = 384;

// On globalThis: instrumentation.ts warms the model from its own bundle, and a second copy of
// ~710 MB would not fit in the instance.
const shared = globalThis as { embeddingExtractor?: Promise<FeatureExtractionPipeline> };

function getExtractor(): Promise<FeatureExtractionPipeline> {
  shared.embeddingExtractor ??= import("@huggingface/transformers").then(
    ({ pipeline }) =>
      pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: EMBEDDING_DTYPE }) as Promise<FeatureExtractionPipeline>,
  );
  return shared.embeddingExtractor;
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const ext = await getExtractor();
  const output = await ext(texts.map(stripAccents), { pooling: "mean", normalize: true });
  return output.tolist() as number[][];
}

// The tokenizer splits some accented words into noisy pieces: "cerámica" scored ≥0.6 against
// fintech, trekking and crochet, while "ceramica" stays below 0.5.
export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
