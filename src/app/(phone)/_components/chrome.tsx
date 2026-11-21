"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { Icon, type IconName } from "./icons";
import { MingaMark } from "./minga-mark";
import { COPY } from "../_lib/copy";
import { type PhoneState, usePhone } from "../_lib/store";

const TABS: { href: string; label: string; icon: IconName; also?: string[] }[] = [
  { href: "/", label: COPY.tabs.inicio, icon: "home" },
  { href: "/coincidencias", label: COPY.tabs.coincidencias, icon: "node" },
  { href: "/conversaciones", label: COPY.tabs.conversaciones, icon: "chat" },
  { href: "/perfil", label: COPY.tabs.perfil, icon: "person", also: ["/nodo"] },
];

/** Floating bar of four rounded buttons; the active one is white. */
export function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="Secciones">
      {TABS.map((t) => {
        const cur = path === t.href || (t.href !== "/" && path.startsWith(`${t.href}/`)) || !!t.also?.includes(path);
        return (
          <Link key={t.href} href={t.href} className={`tb${cur ? " cur" : ""}`} aria-current={cur ? "page" : undefined}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Bottom sheet with two heights: a list, or a detail. */
export function Sheet({
  open,
  size = "list",
  onClose,
  label,
  children,
}: {
  open: boolean;
  size?: "list" | "detail" | "auto";
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="sheet-bg" onClick={onClose} />
      <div className={`sheet ${size}`} role="dialog" aria-modal="true" aria-label={label}>
        <div className="grab" />
        {children}
      </div>
    </>
  );
}

export function Splash() {
  return (
    <div className="app">
      <div className="splash">
        <MingaMark />
        {COPY.app}
      </div>
    </div>
  );
}

/** Phone state, or the splash while it loads; sends you to onboarding if you have no node yet. */
export function useOnboardedPhone(): PhoneState | undefined {
  const s = usePhone();
  const router = useRouter();
  const ready = s?.onboarded;
  useEffect(() => {
    if (s && !ready) router.replace("/bienvenida");
  }, [s, ready, router]);
  return ready ? s : undefined;
}
