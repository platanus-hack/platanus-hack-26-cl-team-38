// The judge model is chosen per deploy with PRIVACY_JUDGE_MODEL ("haiku" or "opus"). Measured on
// eval-set.ts: Haiku 5.5 classifies a 46-topic profile in ~1.8 s and leaves 1 to 3 sensitive topics
// in "tú decides"; Opus 5.5 takes ~2.4 s, leaves none and gives the same answer on every run.
const JUDGES = {
  haiku: { model: "claude-haiku-5-5", timeoutMs: 6000, canDisableThinking: true, refusalFallback: false },
  opus: { model: "claude-opus-5-5", timeoutMs: 12000, canDisableThinking: false, refusalFallback: true },
} as const;

export type JudgeConfig = (typeof JUDGES)[keyof typeof JUDGES];
const DEFAULT: keyof typeof JUDGES = "haiku";

// Read at call time, not at import: scripts load .env.local after their imports run.
export function resolveJudge(value: string | undefined = process.env.PRIVACY_JUDGE_MODEL): { config: JudgeConfig; recognized: boolean } {
  const wanted = value?.trim().toLowerCase();
  if (!wanted) return { config: JUDGES[DEFAULT], recognized: true };
  const match = Object.entries(JUDGES).find(([alias, config]) => wanted === alias || wanted === config.model);
  return match ? { config: match[1], recognized: true } : { config: JUDGES[DEFAULT], recognized: false };
}

export function describeJudge(value: string | undefined = process.env.PRIVACY_JUDGE_MODEL): string {
  const { config, recognized } = resolveJudge(value);
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (!hasKey) return `[privacy] sin ANTHROPIC_API_KEY: el juez no corre y el check-in rechaza lo que no bloquee el léxico`;
  if (!recognized) return `[privacy] PRIVACY_JUDGE_MODEL="${value}" no es "haiku" ni "opus": el juez corre con ${config.model}`;
  return `[privacy] juez: ${config.model}`;
}
