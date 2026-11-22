// Minga's mark: two rounded squares joined by a curved neck, two circles on the other diagonal.
// Same geometry as src/app/icon.svg.
const MINGA_PATH =
  "M4.6 2h3a2.6 2.6 0 0 1 2.6 2.6v2.8c0 3.5 2.9 6.4 6.4 6.4h2.8a2.6 2.6 0 0 1 2.6 2.6v3a2.6 2.6 0 0 1-2.6 2.6h-3a2.6 2.6 0 0 1-2.6-2.6v-2.8c0-3.5-2.9-6.4-6.4-6.4H4.6A2.6 2.6 0 0 1 2 7.6v-3A2.6 2.6 0 0 1 4.6 2Z";

export function MingaMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d={MINGA_PATH} fill="currentColor" />
      <circle cx="17.6" cy="6.4" r="4.4" fill="currentColor" />
      <circle cx="6.4" cy="17.6" r="4.4" fill="currentColor" />
    </svg>
  );
}
