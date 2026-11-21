import { describe, expect, it } from "vitest";
import type { SynthesisSignal } from "@/lib/types";
import { createInboxStore } from "./inbox";

const signal = (label: string, strength = 0.8, source: SynthesisSignal["source"] = "claude"): SynthesisSignal => ({ source, kind: "sabe", label, strength });
const MINUTE = 60_000;

describe("createInboxStore", () => {
  it("delivers with the token and reads with the inbox id, and reading empties it", () => {
    const store = createInboxStore();
    const { token, inbox } = store.open(0);
    expect(store.deliver(token, [signal("pagos")], 1)).toBe(true);
    expect(store.drain(inbox, 2)).toEqual([signal("pagos")]);
    expect(store.drain(inbox, 3)).toEqual([]);
  });

  it("keeps the two secrets apart: the token cannot read and the inbox id cannot write", () => {
    const store = createInboxStore();
    const { token, inbox } = store.open(0);
    expect(store.drain(token, 1)).toBeNull();
    expect(store.deliver(inbox, [signal("pagos")], 1)).toBe(false);
  });

  it("accepts several deliveries on one token and keeps the strongest reading of a repeated signal", () => {
    const store = createInboxStore();
    const { token, inbox } = store.open(0);
    store.deliver(token, [signal("pagos", 0.5), signal("running", 0.6)], 1);
    store.deliver(token, [signal("pagos", 0.9), signal("pagos", 0.4, "chatgpt")], 2);
    expect(store.drain(inbox, 3)).toEqual([signal("pagos", 0.9), signal("running", 0.6), signal("pagos", 0.4, "chatgpt")]);
  });

  it("refuses an expired token, lets the phone collect a little longer, then forgets everything", () => {
    const store = createInboxStore(15 * MINUTE);
    const { token, inbox } = store.open(0);
    store.deliver(token, [signal("pagos")], 14 * MINUTE);
    expect(store.has(token, 15 * MINUTE)).toBe(true);
    expect(store.has(token, 15 * MINUTE + 1)).toBe(false);
    expect(store.deliver(token, [signal("running")], 15 * MINUTE + 1)).toBe(false);
    expect(store.drain(inbox, 19 * MINUTE)).toEqual([signal("pagos")]);
    expect(store.drain(inbox, 21 * MINUTE)).toBeNull();
  });

  it("does not let one person's token reach another person's inbox", () => {
    const store = createInboxStore();
    const ana = store.open(0);
    const beto = store.open(0);
    store.deliver(ana.token, [signal("pagos")], 1);
    expect(store.drain(beto.inbox, 2)).toEqual([]);
    expect(store.deliver("inventado", [signal("x")], 2)).toBe(false);
  });
});
