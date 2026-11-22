"use client";

import { useEffect, useSyncExternalStore } from "react";
import { COPY } from "../_lib/copy";
import { Icon } from "./icons";

// Desktop only, to present: puts the whole page (phone frame and graph) in the browser's
// fullscreen without changing how it looks. Esc leaves; F toggles when no field has focus.
// The button hides while in fullscreen so it never shows on the projector.

function subscribe(cb: () => void) {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
}

function toggle() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => {});
}

function typing(t: EventTarget | null) {
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

export function FullscreenToggle() {
  const on = useSyncExternalStore(
    subscribe,
    () => document.fullscreenElement !== null,
    () => false,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "f" || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (on) return null;
  return (
    <button type="button" className="fs-toggle" onClick={toggle} aria-keyshortcuts="F">
      <Icon name="expand" />
      {COPY.fullscreen}
      <kbd>F</kbd>
    </button>
  );
}
