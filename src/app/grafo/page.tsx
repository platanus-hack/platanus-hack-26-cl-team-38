import type { Metadata } from "next";
import { GraphExplorer } from "./graph-explorer";

export const metadata: Metadata = { title: "Grafo de la sala · Minga" };

export default function GrafoPage() {
  return <GraphExplorer />;
}
