import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { Onboarding, type TeamProfile } from "./onboarding";

export const metadata: Metadata = { title: "Bienvenida · Minga" };

// Teammates' seed profiles (seed/team/*.json), offered as ready-made profiles for the demo.
const TEAM: TeamProfile[] = readdirSync(path.join(process.cwd(), "seed/team"))
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => {
    const { slug, displayName, topics } = JSON.parse(readFileSync(path.join(process.cwd(), "seed/team", f), "utf8")) as TeamProfile;
    return { slug, displayName, topics };
  });

export default function BienvenidaPage() {
  return <Onboarding team={TEAM} />;
}
