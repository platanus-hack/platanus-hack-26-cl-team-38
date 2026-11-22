"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef } from "react";
import { Icon, type IconName } from "./icons";
import { MingaMark } from "./minga-mark";
import { COPY } from "../_lib/copy";
import { useToast } from "../_lib/toast";
import { type PhoneState, usePhone } from "../_lib/store";

const TABS: { href: string; label: string; icon: IconName; also?: string[] }[] = [
  { href: "/", label: COPY.tabs.inicio, icon: "home" },
  { href: "/coincidencias", label: COPY.tabs.coincidencias, icon: "node" },
  { href: "/conversaciones", label: COPY.tabs.conversaciones, icon: "chat" },
  { href: "/perfil", label: COPY.tabs.perfil, icon: "person", also: ["/nodo"] },
];

/** Floating bar of four rounded buttons, icons only; the active one is white. */
export function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label={COPY.sections}>
      {TABS.map((t) => {
        const cur = path === t.href || (t.href !== "/" && path.startsWith(`${t.href}/`)) || !!t.also?.includes(path);
        return (
          <Link key={t.href} href={t.href} className={`tb${cur ? "cur" : ""}`} aria-current={cur ? "page" : undefined}>
            <Icon name={t.icon} />
            <span className="sr">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Bottom sheet with two heights: a list, or a detail. A close button stays in its corner while
    the content scrolls; pulling the top down, tapping outside or Escape also closes it. */
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
  const sheet = useRef<HTMLDivElement>(null);
  const bg = useRef<HTMLDivElement>(null);
  const pull = useRef<{ id: number; y: number; t: number; dy: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;

  // Pull to close: the sheet follows the finger down; past a third of its height, or flicked, it closes.
  const follow = (dy: number, animate: boolean) => {
    const el = sheet.current;
    if (!el) return;
    el.style.transition = animate ? "transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)" : "none";
    el.style.transform = dy ? `translateY(${dy}px)` : "";
    if (bg.current) bg.current.style.opacity = String(1 - Math.min(1, dy / el.offsetHeight));
  };
  const down = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pull.current = { id: e.pointerId, y: e.clientY, t: e.timeStamp, dy: 0 };
  };
  const move = (e: ReactPointerEvent) => {
    const p = pull.current;
    if (!p || p.id !== e.pointerId) return;
    p.dy = Math.max(0, e.clientY - p.y);
    follow(p.dy, false);
  };
  const up = (e: ReactPointerEvent) => {
    const p = pull.current;
    if (!p || p.id !== e.pointerId) return;
    pull.current = null;
    const fast = p.dy / Math.max(1, e.timeStamp - p.t) > 0.6;
    if (p.dy > (sheet.current?.offsetHeight ?? 600) / 3 || (fast && p.dy > 24)) onClose();
    else follow(0, true);
  };

  return (
    <>
      <div className="sheet-bg" ref={bg} onClick={onClose} />
      <div className={`sheet ${size}`} ref={sheet} role="dialog" aria-modal="true" aria-label={label}>
        <div className="sheet-top" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <div className="grab" />
          <button type="button" className="sheet-x" aria-label={COPY.close} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>
  );
}

/** The short note after an action, above the tab bar. Read aloud by screen readers. */
export function Toaster() {
  const t = useToast();
  return (
    <div className="toast-wrap" aria-live="polite">
      {t && (
        <div key={t.id} className="toast">
          <Icon name="check" />
          {t.text}
        </div>
      )}
    </div>
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
