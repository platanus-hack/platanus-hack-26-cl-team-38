import type { Metadata } from "next";
import { Explorer } from "./explorer";

export const metadata: Metadata = { title: "Explorar la sala · Minga" };

export default function ExplorarPage() {
  return <Explorer />;
}
