import { describe, expect, it } from "vitest";
import { UserInfoSchema } from "@/lib/types";
import { FORMAT, parseInfo } from "./info";

const raw = { email: "  Ana@Example.COM ", age: "30", gender: "Mujer", phone: "9 1234 5678", occupation: "  diseñadora   de producto " };

describe("Perfil → Información", () => {
  it("tidies what was typed into what the server accepts", () => {
    const out = parseInfo(raw);
    expect(out).toEqual({ ok: true, info: { email: "ana@example.com", age: 30, gender: "Mujer", phone: "+56 9 1234 5678", occupation: "Diseñadora de producto" } });
    if (out.ok) expect(UserInfoSchema.safeParse(out.info).success).toBe(true);
  });

  it("formats phones however they were typed", () => {
    for (const typed of ["912345678", "+56912345678", "56 9 1234-5678", "(+56) 9 1234 5678"]) expect(FORMAT.phone(typed)).toBe("+56 9 1234 5678");
    expect(FORMAT.phone("+1 (415) 555-2671")).toBe("+14155552671");
    expect(FORMAT.phone("2 2345 6789")).toBe("223456789");
    // Never longer than the contract allows.
    expect(FORMAT.phone("+1234567890123456789")).toMatch(/^\+?[0-9 ]{8,16}$/);
  });

  it("names the first field that does not fit", () => {
    expect(parseInfo({ ...raw, email: "ana@" })).toEqual({ ok: false, field: "email" });
    expect(parseInfo({ ...raw, age: "" })).toEqual({ ok: false, field: "age" });
    expect(parseInfo({ ...raw, age: "12" })).toEqual({ ok: false, field: "age" });
    expect(parseInfo({ ...raw, gender: "" })).toEqual({ ok: false, field: "gender" });
    expect(parseInfo({ ...raw, phone: "123" })).toEqual({ ok: false, field: "phone" });
  });

  it("leaves the optional Oficio empty", () => {
    const out = parseInfo({ ...raw, occupation: "   " });
    expect(out.ok && out.info.occupation).toBe("");
  });
});
