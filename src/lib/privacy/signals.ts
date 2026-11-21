import type { Signal, SynthesisSignal } from "@/lib/types";
import { screen } from "./screen";

// Runs on the phone before anything is sent to a synthesizer: a signal the lexicon blocks never
// reaches a model, and no signal travels with its evidence.
export function splitSignals(signals: Signal[]): { sendable: SynthesisSignal[]; held: Signal[] } {
  const sendable: SynthesisSignal[] = [];
  const held: Signal[] = [];
  for (const signal of signals) {
    if (screen({ kind: signal.kind, name: signal.label })) held.push(signal);
    else sendable.push({ source: signal.source, kind: signal.kind, label: signal.label, strength: signal.strength });
  }
  return { sendable, held };
}
