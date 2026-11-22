import { describe, expect, it, vi } from "vitest";
import { createInboxStore } from "./inbox";
import { admitProfile, buildProfilePrompt, PROFILE_MAX_CHARS, receiveProfile } from "./profile";

// Stands in for the privacy filter: a line is sensitive or unreviewed when it contains the word.
const classifier = ({ sensible = [] as string[], unreviewed = [] as string[] } = {}) =>
  vi.fn(async (topics: { name: string }[]) =>
    topics.map((t) => ({
      privacy: { level: sensible.some((word) => t.name.includes(word)) ? ("sensible" as const) : ("segura" as const) },
      judged: !unreviewed.some((word) => t.name.includes(word)),
    })),
  );

const PROFILE = `# Perfil

## Viajes
- Prefiere hostales y moverse en bus.
- Viaja con su **pareja** todos los veranos.

## Salud
- Toma medicación para dormir.

## Comida
- Le gusta la comida callejera.`;

describe("admitProfile", () => {
  it("hands every line to the privacy filter as plain text, with no markdown marks", async () => {
    const classify = classifier();
    await admitProfile("## Viajes\n- Prefiere **hostales** y moverse en `bus`.\n", "chatgpt", classify);
    expect(classify).toHaveBeenCalledWith([
      { kind: "es", name: "Viajes", sources: ["chatgpt"] },
      { kind: "es", name: "Prefiere hostales y moverse en bus.", sources: ["chatgpt"] },
    ]);
  });

  it("drops the lines the filter calls sensible and the sections left empty, and keeps the rest as markdown", async () => {
    const result = await admitProfile(PROFILE, "claude", classifier({ sensible: ["pareja", "medicación"] }));
    expect(result).toEqual({
      markdown: "# Perfil\n\n## Viajes\n- Prefiere hostales y moverse en bus.\n\n## Comida\n- Le gusta la comida callejera.",
      kept: 2,
      held: 2,
      unreviewed: 0,
    });
  });

  it("fails closed: a line nobody reviewed is not admitted", async () => {
    const result = await admitProfile(PROFILE, "claude", classifier({ unreviewed: ["hostales"] }));
    expect(result.markdown).not.toContain("hostales");
    expect(result).toMatchObject({ kept: 3, held: 0, unreviewed: 1 });
  });

  it("reads a profile that came wrapped in a code fence", async () => {
    const result = await admitProfile("```markdown\n## Viajes\n- Prefiere hostales.\n```", "claude", classifier());
    expect(result.markdown).toBe("## Viajes\n- Prefiere hostales.");
  });
});

function setup(options: Parameters<typeof classifier>[0] = {}) {
  const store = createInboxStore();
  const { token, inbox: inboxId } = store.open();
  const classify = classifier(options);
  return { store, classify, token, inboxId, deps: { inbox: store, classify } };
}

describe("receiveProfile", () => {
  it("filters on the way in: the phone only collects what the privacy filter let through", async () => {
    const { store, token, inboxId, deps } = setup({ sensible: ["pareja", "medicación"] });
    const result = await receiveProfile(token, "claude", PROFILE, deps);
    expect(result.status).toBe(200);
    expect(result.message).toContain("2 líneas se descartaron");
    const [profile] = store.drainProfiles(inboxId) ?? [];
    expect(profile.source).toBe("claude");
    expect(profile.markdown).not.toMatch(/pareja|medicación/);
    expect(store.drainProfiles(inboxId)).toEqual([]);
  });

  it("does not run the filter for someone without a live token", async () => {
    const { classify, deps } = setup();
    expect((await receiveProfile(undefined, "claude", PROFILE, deps)).status).toBe(401);
    expect((await receiveProfile("inventado", "claude", PROFILE, deps)).status).toBe(401);
    expect(classify).not.toHaveBeenCalled();
  });

  it("answers 400 to an unknown source, an empty file or one that is too long, without filtering it", async () => {
    const { classify, token, deps } = setup();
    expect((await receiveProfile(token, "spotify", PROFILE, deps)).status).toBe(400);
    expect((await receiveProfile(token, "claude", "  \n", deps)).status).toBe(400);
    expect((await receiveProfile(token, "claude", "- a\n".repeat(PROFILE_MAX_CHARS), deps)).status).toBe(400);
    expect(classify).not.toHaveBeenCalled();
  });

  it("answers 503 and stores nothing when the filter could not review any line", async () => {
    const { store, token, inboxId, deps } = setup({ unreviewed: [""] });
    expect((await receiveProfile(token, "claude", PROFILE, deps)).status).toBe(503);
    expect(store.drainProfiles(inboxId)).toEqual([]);
  });

  it("keeps one profile per assistant: a second upload from the same one replaces the first", async () => {
    const { store, token, inboxId, deps } = setup();
    await receiveProfile(token, "claude", "- Le gusta el jazz.", deps);
    await receiveProfile(token, "claude", "- Le gusta el rock.", deps);
    await receiveProfile(token, "chatgpt", "- Le gusta el trekking.", deps);
    expect(store.drainProfiles(inboxId)).toEqual([
      { source: "claude", markdown: "- Le gusta el rock." },
      { source: "chatgpt", markdown: "- Le gusta el trekking." },
    ]);
  });
});

describe("buildProfilePrompt", () => {
  it("carries where to upload the file, the token, when it expires and what to leave out", () => {
    const prompt = buildProfilePrompt({ origin: "https://app.test", token: "tok", minutes: 15 });
    expect(prompt).toContain('"https://app.test/api/onboarding/profile?source=claude"');
    expect(prompt).toContain("Authorization: Bearer tok");
    expect(prompt).toContain("vence en 15 minutos");
    expect(prompt).toContain("salud física o mental");
    expect(prompt).toContain('la herramienta "subir_perfil"), úsala con token "tok"');
  });
});
