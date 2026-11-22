"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Topic } from "@/lib/types";
import { Icon } from "./icons";
import { COPY } from "../_lib/copy";
import { cx } from "../_lib/cx";

/** Back arrow: returns to the screen you came from; opened from a link, it goes to `fallback`. */
export function BackLink({
  fallback,
  className,
  style,
}: {
  fallback: string;
  className?: string;
  style?: CSSProperties;
}) {
  const router = useRouter();
  return (
    <Link
      href={fallback}
      className={className}
      style={style}
      aria-label={COPY.back}
      onClick={(e) => {
        if (window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
    >
      <Icon name="arrow" />
    </Link>
  );
}

/** Distances, times and counts. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`mono${className ? ` ${className}` : ""}`}>{children}</span>;
}

/** A face or an icon, a title, one secondary line, and a value in mono on the right. */
export function ListRow({
  lead,
  title,
  sub,
  data,
  href,
  onClick,
  chevron,
  className,
}: {
  lead?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  data?: ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {lead && <span className="lead">{lead}</span>}
      <span className="main">
        <span className="title" style={{ display: "block" }}>
          {title}
        </span>
        {sub && (
          <span className="sub" style={{ display: "block" }}>
            {sub}
          </span>
        )}
      </span>
      {data !== undefined && <Mono className="data">{data}</Mono>}
      {chevron && (
        <svg className="ic chev" aria-hidden="true">
          <use href="#i-chev" />
        </svg>
      )}
    </>
  );
  const cls = `row${className ? ` ${className}` : ""}`;
  if (href)
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" className={cls} onClick={onClick}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}

/** A line and an arrow. Multi-line when `rows` > 1: it starts at one line, centered with the arrow,
    and grows with the text (or a long placeholder) up to `rows` lines. */
export function Field({
  value,
  onChange,
  onSubmit,
  placeholder,
  rows = 1,
  done,
  label,
  maxLength,
  send = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  rows?: number;
  done?: boolean;
  label: string;
  maxLength?: number;
  /** A send icon instead of the arrow, which stays after sending. */
  send?: boolean;
}) {
  // A send field can go again with the same text; the arrow only when something changed.
  const ready = value.trim().length > 0 && (!done || send);
  const area = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const line = parseFloat(getComputedStyle(el).lineHeight) || 22;
    const pad =
      el.offsetHeight -
      el.clientHeight +
      parseFloat(getComputedStyle(el).paddingTop) +
      parseFloat(getComputedStyle(el).paddingBottom);
    el.style.height = "auto";
    // An empty field measures its placeholder, so a long one gets its second line too.
    const probe = !value && placeholder ? (el.value = placeholder) : null;
    const h = el.scrollHeight;
    if (probe !== null) el.value = "";
    el.style.height = `${Math.min(h, line * rows + pad)}px`;
  }, [value, placeholder, rows]);
  return (
    <form className="field" onSubmit={(e) => (e.preventDefault(), ready && onSubmit())}>
      {rows > 1 ? (
        <textarea
          ref={area}
          aria-label={label}
          rows={1}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (ready) onSubmit();
            }
          }}
        />
      ) : (
        <input
          aria-label={label}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <button
        type="submit"
        className={cx("go", ready && "on", done && "done")}
        aria-label={done ? COPY.sent : COPY.send}
        disabled={!ready}
      >
        <Icon name={send ? "send" : done ? "check" : "arrow"} />
      </button>
    </form>
  );
}

/** A big title that hands over to a small centered one when it scrolls away. */
export function LargeTitle({
  title,
  back,
  right,
  sub,
}: {
  title: string;
  back?: string;
  right?: ReactNode;
  sub?: ReactNode;
}) {
  const big = useRef<HTMLHeadingElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = big.current;
    if (!el) return;
    // Stuck as soon as the title starts going under the bar: a two-line title would otherwise
    // show half of itself under it before the small one appears.
    const io = new IntersectionObserver(
      ([e]) => setStuck(e.intersectionRatio < 1 && e.boundingClientRect.top < (e.rootBounds?.top ?? 48)),
      {
        rootMargin: "-48px 0px 0px 0px",
        threshold: 1,
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <>
      <div className={cx("lt-bar", stuck && "stuck")}>
        <span className="slot">{back && <BackLink fallback={back} className="back slot" />}</span>
        <span className="small-title" aria-hidden={!stuck}>
          {title}
        </span>
        <span className="slot">{right}</span>
      </div>
      <div className="lt">
        <h1 className="t-title" ref={big}>
          {title}
        </h1>
        {sub}
      </div>
    </>
  );
}

/** One eye: public or only yours. */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${label}: ${on ? COPY.isPublic : COPY.onlyYou}`}
      className={cx("toggle", on && "on")}
      onClick={() => onChange(!on)}
    >
      <Icon name={on ? "eye" : "eyeoff"} />
    </button>
  );
}

/** Topics as running text: weight says depth, a dot separates them. */
export function Tags({ topics, selected }: { topics: Pick<Topic, "id" | "name" | "depth">[]; selected?: Set<string> }) {
  return (
    <p className="tags" style={{ margin: 0 }}>
      {topics.map((t, i) => (
        <span key={t.id}>
          {i > 0 && <span className="sep"> · </span>}
          <span className={cx("tag", `d${t.depth}`, selected?.has(t.name) && "sel")}>{t.name}</span>
        </span>
      ))}
    </p>
  );
}

/** "?" that reveals one line of explanation, once. */
export function Why({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="why">
      <button
        type="button"
        className="q"
        aria-expanded={open}
        aria-label={COPY.whatIsThis}
        onClick={() => setOpen(!open)}
      >
        ?
      </button>
      {open && <span className="hint">{text}</span>}
    </span>
  );
}
