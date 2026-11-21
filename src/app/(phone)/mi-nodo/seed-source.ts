import type { DraftTopic } from "@/lib/node/node";

export type SeedTopic = DraftTopic;
export type SeedPerson = { personId: string; displayName: string; rooms: { code: string; name: string }[]; topics: SeedTopic[] };
