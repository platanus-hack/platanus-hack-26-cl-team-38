import { describeJudge } from "@/lib/privacy/judge-model";

// Runs once when the server starts: the deploy log says which judge model this instance uses, and
// the embedding model starts loading. It used to load on the first request that needed it, so
// whoever onboarded first after a deploy waited for it. Not awaited: the server starts at once.
export async function register() {
  console.info(describeJudge());
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { embed } = await import("./lib/embeddings");
  const started = Date.now();
  embed(["minga"]).then(
    () => console.log(`[embeddings] modelo cargado en ${Date.now() - started} ms`),
    (error: unknown) => console.error("[embeddings] no se pudo precargar el modelo:", error),
  );
}
