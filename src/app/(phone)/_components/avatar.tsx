
// Illustrated avatars from the v3 mockup. Color and hair come from a hash of the person id, so the
// same person looks the same on every phone and on the projector.

// Lively but not loud: warm and cool tones that read well on stone and on slate.
const COLORS = ["#FF8A5B", "#3FC1A5", "#FFB547", "#7C8CFF", "#F06A8C", "#5BB8E8", "#9B7BE0", "#E0A35A"];
const HAIR_COLORS = ["#1E2230", "#3B2A1F", "#2A1D16", "#4A2C1A", "#231A20", "#5A4636"];
const STYLES = ["short", "beard", "curly", "long", "bob", "bun"] as const;

const SHORT = '<path d="M13 17.6c-1-6.9 2.6-10.1 7-10.1s8 3.2 7 10.1c-1.3-2.9-3.7-4.5-7-4.5s-5.7 1.6-7 4.5z"/>';
const FRINGE = '<path d="M13.2 17c.5-5.3 3-8 6.8-8s6.3 2.7 6.8 8c-2.7-1.4-4.5-3.4-5.5-5.5-1.6 2.7-4.5 4.5-8.1 5.5z"/>';
const BACK: Partial<Record<(typeof STYLES)[number], string>> = {
  long: "M11.6 31c-2-6.5-1.6-14.2 1.4-18.4C14.8 10 17.2 8.8 20 8.8s5.2 1.2 7 3.8c3 4.2 3.4 11.9 1.4 18.4z",
  bob: "M12.4 24.5c-1.6-5.2-1-11 1.9-13.9C16 8.9 17.9 8.2 20 8.2s4 .7 5.7 2.4c2.9 2.9 3.5 8.7 1.9 13.9z",
};
const FRONT: Record<(typeof STYLES)[number], string> = {
  short: SHORT,
  beard: SHORT + '<path d="M13.2 19.2c.3 4.7 3 7.1 6.8 7.1s6.5-2.4 6.8-7.1c-1.4 1.7-3.7 2.5-6.8 2.5s-5.4-.8-6.8-2.5z"/>',
  curly:
    '<circle cx="14" cy="14.2" r="3.4"/><circle cx="17" cy="10.8" r="3.6"/><circle cx="21.6" cy="10.3" r="3.7"/><circle cx="25.6" cy="13.4" r="3.4"/><circle cx="26.7" cy="17" r="2.3"/><circle cx="13.2" cy="17.4" r="2.2"/>',
  long: FRINGE,
  bob: FRINGE,
  bun: '<path d="M13.2 17c-.6-5.9 2.6-9 6.8-9s7.4 3.1 6.8 9c-1.6-2.5-3.8-3.7-6.8-3.7s-5.2 1.2-6.8 3.7z"/><circle cx="20" cy="7.4" r="3.6"/>',
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function avatarColor(id: string): string {
  return COLORS[hash(id) % COLORS.length];
}

/** Inner SVG markup (40×40 viewBox); the graph panel draws it inside its own <svg>. */
export function avatarSvg(id: string): string {
  const h = hash(id);
  const color = COLORS[h % COLORS.length];
  const hair = HAIR_COLORS[(h >>> 3) % HAIR_COLORS.length];
  const style = STYLES[(h >>> 7) % STYLES.length];
  const back = BACK[style] ? `<path d="${BACK[style]}" fill="${hair}"/>` : "";
  return `<g clip-path="url(#avc)"><rect width="40" height="40" fill="${color}"/>${back}<path d="M5.5 42c.4-8.8 6.4-13.6 14.5-13.6s14.1 4.8 14.5 13.6z" fill="#fff" fill-opacity=".74"/><circle cx="20" cy="17.6" r="7" fill="#fff"/><g fill="${hair}">${FRONT[style]}</g></g>`;
}

export function Avatar({ id, className }: { id: string; className?: string }) {
  return (
    <span className={`av${className ? ` ${className}` : ""}`}>
      <svg viewBox="0 0 40 40" aria-hidden="true" dangerouslySetInnerHTML={{ __html: avatarSvg(id) }} />
    </span>
  );
}
