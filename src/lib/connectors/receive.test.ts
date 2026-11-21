import { describe, expect, it, vi } from "vitest";
import { createInboxStore } from "./inbox";
import { receiveSignals } from "./receive";

const signal = (label: string) => ({ source: "claude", kind: "sabe", label, strength: 0.8 });

// `classify` stands in for the privacy filter: it calls sensitive whatever is listed.
function setup(sensible: string[] = []) {
  const store = createInboxStore();
  const { token, inbox: inboxId } = store.open();
  const classify = vi.fn(async (topics: { name: string }[]) => topics.map((t) => ({ privacy: { level: sensible.includes(t.name) ? ("sensible" as const) : ("segura" as const) } })));
  return { store, classify, token, inboxId, deps: { inbox: store, classify } };
}

describe("receiveSignals", () => {
  it("filters on the way in: the phone only collects what the privacy filter let through, in the format it arrived in", async () => {
    const { store, token, inboxId, deps } = setup(["mi diagnostico"]);
    const result = await receiveSignals(token, [signal("pagos"), signal("mi diagnostico")], deps);
    expect(result).toEqual({ status: 200, message: "Recibidas 1 señales. 1 se descartaron por ser datos sensibles. Nada se publicó: quedan como borrador en el teléfono de la persona." });
    expect(store.drain(inboxId)).toEqual([signal("pagos")]);
  });

  it("does not run the filter for someone without a live token", async () => {
    const { classify, deps } = setup();
    expect((await receiveSignals(undefined, [signal("pagos")], deps)).status).toBe(401);
    expect((await receiveSignals("inventado", [signal("pagos")], deps)).status).toBe(401);
    expect(classify).not.toHaveBeenCalled();
  });

  it("answers 400 to a body that is not signals, or that carries evidence, without filtering it", async () => {
    const { classify, token, deps } = setup();
    expect((await receiveSignals(token, { topics: [] }, deps)).status).toBe(400);
    expect((await receiveSignals(token, [{ ...signal("pagos"), evidence: "me lo contó" }], deps)).status).toBe(400);
    expect(classify).not.toHaveBeenCalled();
  });

  it("still answers 200 when everything was filtered out, so the assistant does not retry", async () => {
    const { store, token, inboxId, deps } = setup(["mi diagnostico"]);
    expect(await receiveSignals(token, [signal("mi diagnostico")], deps)).toMatchObject({ status: 200, message: expect.stringContaining("Recibidas 0 señales. 1 se descartaron") });
    expect(store.drain(inboxId)).toEqual([]);
  });
});
