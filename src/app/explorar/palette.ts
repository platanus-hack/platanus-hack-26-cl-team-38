import type { Kind, Role, Source } from "@/lib/types";
import type { PreviewTheme } from "./preview";

export const INK = "#18212F";

export const ROLE: Record<Role, { color: string; label: string; hint: string }> = {
  aporta: { color: "#1F8A5B", label: "Aporta", hint: "sabe o hace el tema" },
  busca: { color: "#6E4BD8", label: "Busca", hint: "quiere aprenderlo o hacerlo" },
  comparte: { color: "#2F7FD1", label: "Comparte", hint: "le gusta, sin más" },
};

export const OUTCOME: Record<PreviewTheme["outcome"], { rim: string; wash: string; text: string; label: string }> = {
  complemento: { rim: "#1F8A5B", wash: "rgba(31,138,91,0.06)", text: "#1F8A5B", label: "Complemento" },
  afinidad: { rim: "#2F7FD1", wash: "rgba(47,127,209,0.06)", text: "#2F7FD1", label: "Afinidad" },
  "sin mesa": { rim: "rgba(24,33,47,0.35)", wash: "transparent", text: "rgba(24,33,47,0.5)", label: "Sin mesa" },
};

export const KIND_LABEL: Record<Kind, string> = {
  es: "es",
  sabe: "sabe",
  hace: "hace",
  le_gusta: "le gusta",
  quiere_ser: "quiere ser",
  busca: "busca",
  ofrece: "ofrece",
};

export const SOURCE_LABEL: Record<Source, string> = {
  claude: "Claude",
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  spotify: "Spotify",
  github: "GitHub",
  instagram: "Instagram",
  google: "Google",
};
