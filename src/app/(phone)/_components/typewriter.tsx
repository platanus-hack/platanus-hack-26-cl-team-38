"use client";

import { useEffect, useState } from "react";

const TYPE_MS = 55;
const DELETE_MS = 28;
const HOLD_MS = 2600;
const GAP_MS = 350;

/**
 * Types each phrase, holds it, erases it and moves on to the next one.
 * Screen readers get the first phrase only; with reduced motion the first phrase stays still.
 */
export function Typewriter({ phrases, className }: { phrases: string[]; className?: string }) {
  const [state, setState] = useState({ i: 0, n: phrases[0].length, deleting: false });

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const phrase = phrases[state.i];
    let delay: number;
    let next: typeof state;
    if (!state.deleting && state.n < phrase.length) {
      delay = TYPE_MS;
      next = { ...state, n: state.n + 1 };
    } else if (!state.deleting) {
      delay = HOLD_MS;
      next = { ...state, deleting: true };
    } else if (state.n > 0) {
      delay = DELETE_MS;
      next = { ...state, n: state.n - 1 };
    } else {
      delay = GAP_MS;
      next = { i: (state.i + 1) % phrases.length, n: 0, deleting: false };
    }
    const id = setTimeout(() => setState(next), delay);
    return () => clearTimeout(id);
  }, [state, phrases]);

  return (
    <div className={className} aria-label={phrases[0]}>
      <span aria-hidden="true">
        {phrases[state.i].slice(0, state.n)}
        <span className="caret" />
      </span>
    </div>
  );
}
