import "server-only";
import { createCachedClassifier } from "./classify";
import { createAnthropicJudge } from "./judge";

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

// One per process, so the verdict cache is shared by onboarding and check-in. Without a key every
// topic stays unjudged, which the check-in rejects.
export const classifyOnServer = createCachedClassifier(
  hasKey ? createAnthropicJudge({ onError: (error) => console.error("privacy judge:", error) }) : undefined,
);
