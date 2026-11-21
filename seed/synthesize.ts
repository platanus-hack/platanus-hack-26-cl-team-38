import { synthesizeTopics } from "@/lib/node/synthesize";
import type { Signal } from "@/lib/types";
import type { SeedTopic } from "./people";

export function synthesizeSeedTopics(signals: Signal[]): SeedTopic[] {
  return synthesizeTopics(signals).map(({ name, kind, depth, sources }) => [name, kind, depth, sources]);
}
