// Icon sprite from the v3 mockup. Rendered once in the phone layout; <Icon> points at a symbol.

const SYMBOLS: Record<string, string> = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  send: '<path d="M21 3L3 10.5l7.5 3L14 21z"/><path d="M10.5 13.5L21 3"/>',
  node: '<path d="M6.5 7.5L12 17l5.5-9.5z"/><circle cx="6.5" cy="7.5" r="2.8" fill="currentColor"/><circle cx="17.5" cy="7.5" r="2.8" fill="currentColor"/><circle cx="12" cy="17" r="2.8" fill="currentColor"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>',
  eyeoff:
    '<path d="M3 3l18 18"/><path d="M10.6 5.6A10 10 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17 17 0 0 1-3.2 3.9M6.6 6.7C3.8 8.5 2 12 2 12s3.6 6.5 10 6.5c1.6 0 3-.4 4.2-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  minus: '<path d="M5 12h14"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  users:
    '<circle cx="9" cy="8.5" r="3.3"/><path d="M3 19.5c0-3.4 2.7-5.6 6-5.6s6 2.2 6 5.6"/><path d="M15.5 5.3a3.2 3.2 0 0 1 0 6.3"/><path d="M17.6 14.2c2 .7 3.4 2.4 3.4 5.3"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  sparkle:
    '<path d="M11 3.5l1.9 5.4 5.4 1.9-5.4 1.9L11 18.1l-1.9-5.4-5.4-1.9 5.4-1.9z"/><path d="M18.5 15v5M16 17.5h5"/>',
  target:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  shield: '<path d="M12 3l8 3v5.5c0 5-3.4 8.4-8 9.5-4.6-1.1-8-4.5-8-9.5V6z"/>',
  home: '<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chat: '<path d="M4 5h16v11h-9.5L6 19.5V16H4z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  person:
    '<circle cx="12" cy="8" r="4.2" fill="currentColor" stroke="none"/><path d="M3.8 21.5c0-4.6 3.6-7.6 8.2-7.6s8.2 3 8.2 7.6z" fill="currentColor" stroke="none"/>',
  alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.3v.01"/>',
  table: '<ellipse cx="12" cy="10" rx="8.5" ry="3.5"/><path d="M12 13.5V20M8.5 20h7"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
  qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.2"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM14 18.5v2M18.5 14h2"/>',
  out: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 16l-4-4 4-4M6 12h9"/>',
  trash: '<path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13"/>',
  filter: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  layers: '<path d="M12 3.5l8.5 4.5-8.5 4.5-8.5-4.5z"/><path d="M3.5 12.5l8.5 4.5 8.5-4.5"/>',
  expand: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
};

export type IconName = keyof typeof SYMBOLS;

const AVATAR_DEFS =
  '<clipPath id="avc"><circle cx="20" cy="20" r="20"/></clipPath>' +
  '<linearGradient id="gemg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#1C7DFF"/><stop offset=".55" stop-color="#9168C0"/><stop offset="1" stop-color="#E0626F"/></linearGradient>' +
  '<radialGradient id="igg" cx=".3" cy="1.05" r="1.2"><stop offset="0" stop-color="#FFD776"/><stop offset=".3" stop-color="#F3A554"/><stop offset=".6" stop-color="#E1306C"/><stop offset="1" stop-color="#7B3FD1"/></radialGradient>';

export function IconSprite() {
  const body =
    `<defs>${AVATAR_DEFS}</defs>` +
    Object.entries(SYMBOLS)
      .map(([id, d]) => `<symbol id="i-${id}" viewBox="0 0 24 24">${d}</symbol>`)
      .join("");
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute" }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={`ic${className ? ` ${className}` : ""}`} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}
