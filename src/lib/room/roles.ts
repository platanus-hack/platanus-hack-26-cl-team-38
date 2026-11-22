import type { PublicTopic, Role } from "@/lib/types";

export const ROLE_ORDER: Role[] = ["aporta", "busca", "comparte"];

// Roles per topic (arquitectura-por-capas § Capa 4). One topic can give more than one role, and
// `sabe` at depth 1 gives none: knowing a little is neither teaching nor looking to learn.
export function rolesOf(topic: Pick<PublicTopic, "kind" | "depth">): Role[] {
  const roles: Role[] = [];
  const { kind, depth } = topic;
  if (((kind === "sabe" || kind === "hace") && depth >= 2) || kind === "ofrece" || kind === "es") roles.push("aporta");
  if (kind === "busca" || kind === "quiere_ser" || (kind === "le_gusta" && depth === 1)) roles.push("busca");
  if (kind === "le_gusta" || kind === "hace") roles.push("comparte");
  return roles;
}
