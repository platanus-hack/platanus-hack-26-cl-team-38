import { describeJudge } from "@/lib/privacy/judge-model";

// Runs once when the server starts: the deploy log says which judge model this instance uses.
export function register() {
  console.info(describeJudge());
}
