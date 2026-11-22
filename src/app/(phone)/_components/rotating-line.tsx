"use client";

import { useEffect, useState } from "react";
import { cx } from "../_lib/cx";

const LEAVE_MS = 400;

/** One line at a time: it stays, slides down as it fades out, and the next one fades in. */
export function RotatingLine({
  lines,
  every = 4200,
  className,
}: {
  lines: readonly string[];
  every?: number;
  className?: string;
}) {
  const [i, setI] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (lines.length < 2) return;
    const t = setTimeout(
      () => {
        if (!leaving) return setLeaving(true);
        setI((n) => n + 1);
        setLeaving(false);
      },
      leaving ? LEAVE_MS : every,
    );
    return () => clearTimeout(t);
  }, [leaving, every, lines.length]);
  if (!lines.length) return null;
  // The lines can change under it (people come and go): the index wraps instead of resetting.
  const at = i % lines.length;
  return (
    <p className={cx("rotating-line", className)}>
      <span key={at} className={cx(leaving && "out")}>
        {lines[at]}
      </span>
    </p>
  );
}
