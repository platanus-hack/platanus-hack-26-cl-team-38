import { screenByAnchors } from "./anchors";

// The privacy filter loads an embedding model the first time it runs, and whoever sends that
// first request waits for it. During onboarding that request comes from an assistant, which gives
// up long before. Warming loads the model and the anchor vectors ahead of time.
export type Warmth = { state: "loading" | "ready" | "failed"; startedAt: number };

const RETRY_AFTER_MS = 60_000;
// After this long the health check stops holding a deploy back: without the model the filter
// still works, it just leaves more topics for the person to decide.
export const WARMUP_LIMIT_MS = 3 * 60_000;

// On globalThis so every route sees the same warm-up, whichever one started it.
const holder = globalThis as typeof globalThis & { privacyWarmth?: Warmth };

export function warmPrivacyFilter(now = Date.now(), load: () => Promise<unknown> = () => screenByAnchors([{ kind: "es", name: "calentamiento" }])): Warmth {
  const current = holder.privacyWarmth;
  if (current && !(current.state === "failed" && now - current.startedAt > RETRY_AFTER_MS)) return current;

  const warmth: Warmth = { state: "loading", startedAt: now };
  holder.privacyWarmth = warmth;
  load().then(
    () => (warmth.state = "ready"),
    (error) => {
      warmth.state = "failed";
      console.error("privacy warm-up:", error);
    },
  );
  return warmth;
}

// What a health check should answer: not ready only while the model is still loading in time.
export function isWarmingUp(warmth: Warmth, now = Date.now()): boolean {
  return warmth.state === "loading" && now - warmth.startedAt < WARMUP_LIMIT_MS;
}
