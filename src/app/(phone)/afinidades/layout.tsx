import type { Viewport } from "next";
import type { ReactNode } from "react";

// The graph screens are slate from top to bottom, so the browser bar is too.
export const viewport: Viewport = { themeColor: "#1f3138" };

export default function GraphLayout({ children }: { children: ReactNode }) {
  return children;
}
