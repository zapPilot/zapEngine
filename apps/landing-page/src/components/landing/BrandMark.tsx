import { MESSAGES } from '@/config/messages';

/**
 * Cross-surface brand identity (marketing nav + docs nav).
 *
 * Inline styles instead of CSS classes because landing.css's `.brand-mark` /
 * `.brand-name` rules are scoped under `.shell-root`, which doesn't wrap docs
 * pages. Inlining keeps this component portable without splitting landing.css.
 */
export function BrandMark() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <svg
        aria-hidden
        width={22}
        height={22}
        viewBox="0 0 64 64"
        fill="none"
        style={{ display: 'block', flexShrink: 0 }}
      >
        <g stroke="#d4c5a3" strokeLinecap="round">
          <path d="M16.5 49.5 A24 24 0 1 1 47.5 49.5" strokeWidth={4.5} />
          <line x1={32} y1={32} x2={42.5} y2={13.8} strokeWidth={3.4} />
        </g>
        <circle cx={32} cy={32} r={3.6} fill="#d4c5a3" />
      </svg>
      <span
        style={{
          color: '#f4f4f5',
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: 0,
        }}
      >
        {MESSAGES.common.brandName}
        <em
          style={{
            marginLeft: 6,
            color: '#a1a1aa',
            fontFamily: 'var(--font-serif), Georgia, serif',
            fontSize: 16,
            fontStyle: 'italic',
            fontWeight: 400,
          }}
        >
          — rules engine
        </em>
      </span>
    </span>
  );
}
