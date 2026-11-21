"use client";

import type { Topic } from "@/lib/types";
import { BrandLogo, SOURCE_META } from "./brand";
import { Icon } from "./icons";
import { Toggle } from "./ui";
import { isSensitive, KIND_LABEL } from "../_lib/node";
import { cap } from "../_lib/people";
import { setTopic } from "../_lib/store";

const DOTS = ["", "●○○", "●●○", "●●●"];

/** One topic of your Nodo: its Fuente, what it is, how deep, and the eye that makes it public. */
export function TopicItem({ topic, editDepth }: { topic: Topic; editDepth?: boolean }) {
  const locked = isSensitive(topic);
  const meta = `${KIND_LABEL[topic.kind]} · ${topic.sources.map((s) => SOURCE_META[s].label).join(", ")}`;
  return (
    <div className="row">
      <span className="lead">
        <BrandLogo source={topic.sources[0]} />
      </span>
      <span className="main">
        <span className={`title tag d${topic.depth}`} style={{ display: "block" }}>
          {cap(topic.name)}
        </span>
        <span className="sub" style={{ display: "block" }}>
          {meta}
          {editDepth && (
            <>
              {" · "}
              <button
                type="button"
                className="mono"
                aria-label={`Profundidad ${topic.depth} de 3. Toca para cambiar`}
                onClick={() => setTopic(topic.id, { depth: ((topic.depth % 3) + 1) as 1 | 2 | 3 })}
              >
                {DOTS[topic.depth]}
              </button>
            </>
          )}
        </span>
      </span>
      {locked ? (
        <span className="toggle" title="Nunca se comparte" aria-label="Nunca se comparte">
          <Icon name="lock" />
        </span>
      ) : (
        <Toggle on={topic.public} label={topic.name} onChange={(v) => setTopic(topic.id, { public: v })} />
      )}
    </div>
  );
}
