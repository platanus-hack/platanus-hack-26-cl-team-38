import { UserInfoSchema, type UserInfo } from "@/lib/types";

// Filler for Perfil → Información of the seeded people, so no screen meets an empty profile.
// Obviously fake and the same on every run: a reserved example domain, a phone number of zeros.
// Gender is never guessed from a name.
const OCCUPATIONS = ["Diseño", "Ingeniería", "Educación", "Salud", "Ventas", "Investigación"];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

// `age` is the one the seed already has for that person (seed/network.v2.json), when it has one.
export function seedUserInfo(personId: string, age?: number): UserInfo {
  const h = hash(personId);
  return UserInfoSchema.parse({
    email: `${personId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@example.com`,
    age: age !== undefined && age >= 13 && age <= 120 ? age : 22 + (h % 34),
    gender: "Prefiero no decir",
    phone: `+56 9 0000 ${String(h % 10000).padStart(4, "0")}`,
    occupation: OCCUPATIONS[(h >>> 8) % OCCUPATIONS.length],
  });
}
