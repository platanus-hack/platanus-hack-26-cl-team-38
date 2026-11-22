import { describe, expect, it } from "vitest";
import type { SynthesisSignal } from "@/lib/types";
import { createInboxStore } from "./inbox";

const signal = (label: string, strength = 0.8, source: SynthesisSignal["source"] = "claude"): SynthesisSignal => ({
  source,
  kind: "sabe",
  label,
  strength,
});
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
    expect(store.drain(inbox, 3)).toEqual([
      signal("pagos", 0.9),
      signal("running", 0.6),
      signal("pagos", 0.4, "chatgpt"),
    ]);
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

describe("owner inboxes (the OAuth connector)", () => {
  const OWNER = "f".repeat(64);
  const HOUR = 60 * MINUTE;

  it("delivers into the phone's inbox and only drainOwner reads it", () => {
    const store = createInboxStore();
    const { token, inbox } = store.openFor(OWNER, 0);
    store.deliver(token, [signal("pagos")], 1);
    expect(store.drain(token, 2)).toBeNull();
    expect(store.drainOwner("e".repeat(64), 2)).toEqual({ signals: [], profiles: [] });
    expect(store.drainOwner(OWNER, 2)).toEqual({ signals: [signal("pagos")], profiles: [] });
    expect(inbox).not.toMatch(/^[0-9a-f]{32}$/);
  });

  it("keeps what arrived for a day after the last delivery, so the phone can be closed meanwhile", () => {
    const store = createInboxStore();
    store.deliverProfile(store.openFor(OWNER, 0).token, "claude", "- Prefiero hostales.", 1);
    expect(store.drainOwner(OWNER, 20 * HOUR).profiles).toEqual([
      { source: "claude", markdown: "- Prefiero hostales." },
    ]);
    store.deliver(store.openFor(OWNER, 20 * HOUR).token, [signal("pagos")], 20 * HOUR);
    expect(store.drainOwner(OWNER, 45 * HOUR)).toEqual({ signals: [], profiles: [] });
  });
});
