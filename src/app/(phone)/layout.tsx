import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ConnectorInbox } from "./_components/connector-inbox";
import { DesktopShell } from "./_components/desktop-shell";
import { IconSprite } from "./_components/icons";
import { COPY } from "./_lib/copy";
import "./nodo.css";

export const metadata: Metadata = {
  title: "Minga",
  description: COPY.description,
  appleWebApp: { capable: true, title: "Minga", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#e7e1d7",
  viewportFit: "cover",
};

export default function PhoneLayout({ children }: { children: ReactNode }) {
  return (
    <div className="nodo">
      <IconSprite />
      <ConnectorInbox />
      <DesktopShell>{children}</DesktopShell>
    </div>
  );
}
