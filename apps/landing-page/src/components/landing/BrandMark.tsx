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
      <span
        aria-hidden
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 30% 30%, #ffffff, #d4c5a3 60%, #6a5e44 100%)',
          boxShadow:
            '0 0 12px rgba(212, 197, 163, 0.3), inset 0 0 0 1px rgba(255, 255, 255, 0.2)',
        }}
      />
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
