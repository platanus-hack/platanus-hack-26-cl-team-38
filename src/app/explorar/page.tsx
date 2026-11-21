import type { Metadata } from "next";
import { Explorer } from "./explorer";

export const metadata: Metadata = { title: "Explorar la sala · team-38" };

export default function ExplorarPage() {
  return <Explorer />;
}
