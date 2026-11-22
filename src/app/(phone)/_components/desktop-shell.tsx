"use client";

import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { Toaster } from "./chrome";
import { GraphStage } from "./graph-stage";

const QUERY = "(min-width: 1024px)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** Phones get only the app. Desktops get the app in a phone frame plus the graph behind it. */
export function DesktopShell({ children }: { children: ReactNode }) {
  const desktop = useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
  return (
    <div className="shell">
      <div className="device">
        <div className="device-screen">
          {children}
          <Toaster />
        </div>
      </div>
      {desktop && <GraphStage />}
    </div>
  );
}
