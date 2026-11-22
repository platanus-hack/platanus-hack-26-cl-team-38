"use client";

import { useEffect, useState } from "react";
import type { Topic } from "@/lib/types";
import { Icon } from "./icons";
import { Tags } from "./ui";
import { COPY } from "../_lib/copy";
import type { Insight } from "../_lib/insight";
import { cap } from "../_lib/people";

const C = COPY.ai;

/**
 * Recomendación IA: your Agent's reading of both public profiles. The (i) shows the exact prompt it
 * answers. Frontend only for now: the reading is built locally (see _lib/insight) after a short pause,
 * so it reads like an Agent at work; re-mount it (key) for each person.
 */
export function AiCard({
  prompt,
  insight,
  listLabel = C.opportunities,
}: {
  prompt: string;
  insight: Insight;
  listLabel?: string;
}) {
  const [info, setInfo] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="ai" aria-live="polite" aria-busy={!ready}>
      <div className="ai-head">
        <Icon name="sparkle" />
        <span>{C.title}</span>
        <button
          type="button"
          className="q"
          aria-expanded={info}
          aria-label={C.promptLabel}
          onClick={() => setInfo(!info)}
        >
          i
        </button>
      </div>
      {info && (
        <div className="ai-prompt">
          <span className="mono">{C.promptLabel}</span>
          {prompt}
        </div>
      )}
      {!ready ? (
        <div className="ai-thinking">
          <span className="sr">{C.thinking}</span>
          <i />
          <i />
          <i />
        </div>
      ) : (
        <div className="ai-body">
          <div className={`ai-verdict${insight.verdict ? ` ${insight.verdict}` : ""}`}>{insight.headline}</div>
          {insight.reason && <p>{insight.reason}</p>}
          {insight.points.length > 0 && (
            <>
              <div className="ai-label">{listLabel}</div>
              <ul>
                {insight.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          )}
          {insight.opener && (
            <>
              <div className="ai-label">{C.opener}</div>
              <p className="ai-opener">{insight.opener}</p>
            </>
          )}
          <div className="ai-note mono">{C.note}</div>
        </div>
      )}
    </section>
  );
}

/** Topics as running text: the first `limit`, the rest behind "Ver más". */
export function MoreTopics({ topics, limit = 3 }: { topics: Pick<Topic, "id" | "name" | "depth">[]; limit?: number }) {
  const [open, setOpen] = useState(false);
  const shown = open ? topics : topics.slice(0, limit);
  return (
    <>
      <Tags topics={shown.map((t) => ({ ...t, name: cap(t.name) }))} />
      {topics.length > limit && (
        <button type="button" className="more-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? COPY.less : `${COPY.more} (${topics.length - limit})`}
        </button>
      )}
    </>
  );
}
