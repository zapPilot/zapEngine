/**
 * The canonical "Regime" dial from `apps/landing-page/public/zap-pilot-icon.svg`,
 * inlined rather than imported: the Control Center is a separate Vite app and
 * reaching across app boundaries for one 800-byte mark would couple two build
 * graphs to save nothing. Strokes use `currentColor` so the token accent is set
 * in CSS instead of being frozen into the file.
 */
export function BrandMark() {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      fill="none"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke="currentColor" strokeLinecap="round">
        <path d="M16.5 49.5 A24 24 0 1 1 47.5 49.5" strokeWidth="3" />
        <g strokeOpacity="0.4" strokeWidth="1.4">
          <line x1="32" x2="32" y1="8" y2="12.5" />
          <line x1="45.8" x2="43.5" y1="12.3" y2="15.6" />
          <line x1="18.2" x2="20.5" y1="12.3" y2="15.6" />
          <line x1="54.6" x2="50.8" y1="23.8" y2="25.2" />
          <line x1="9.4" x2="13.2" y1="23.8" y2="25.2" />
        </g>
        <line strokeWidth="2.6" x1="32" x2="42.5" y1="32" y2="13.8" />
      </g>
      <circle cx="32" cy="32" fill="currentColor" r="3" />
    </svg>
  );
}
