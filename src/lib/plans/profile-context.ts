import { admitProfile, type ClassifyLines } from "@/lib/connectors/profile";
import type { Source } from "@/lib/types";
import type { Db } from "@/lib/users/profile";
import { saveContext } from "./store";

// The detailed profile an assistant wrote, stored line by line where the person's agent, and the
// agents of their connections, can read it. Same filter as when it arrives: a line the privacy
// filter did not review, or called `sensible`, is not stored.

const LINE_MAX = 400;

export function profileLines(markdown: string): { section: string; text: string }[] {
  let section = "";
  const lines: { section: string; text: string }[] = [];
  for (const raw of markdown.split(/\r?\n/)) {
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(raw);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    const text = raw
      .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")
      .replace(/[*_`]/g, "")
      .trim();
    if (text) lines.push({ section, text: text.slice(0, LINE_MAX) });
  }
  return lines;
}

type Deps = { classify: ClassifyLines; embed: (texts: string[]) => Promise<number[][]> };
type AssistantSource = Extract<Source, "claude" | "chatgpt" | "gemini">;

export async function storeProfile(
  db: Db,
  userId: string,
  source: AssistantSource,
  markdown: string,
  deps: Deps,
): Promise<{ kept: number; held: number; unreviewed: number }> {
  const admitted = await admitProfile(markdown, source, deps.classify);
  const lines = profileLines(admitted.markdown);
  const vectors = await deps.embed(lines.map((line) => line.text));
  await saveContext(
    db,
    userId,
    "red",
    source,
    lines.map((line, i) => ({
      lineId: `${source}-${i + 1}`,
      section: line.section,
      text: line.text,
      embedding: vectors[i],
    })),
  );
  return { kept: lines.length, held: admitted.held, unreviewed: admitted.unreviewed };
}
