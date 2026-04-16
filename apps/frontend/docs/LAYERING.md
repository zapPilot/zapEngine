Layering Guidelines (z-index)

Purpose

- Standardize stacking context across headers, banners, content, overlays, and toasts.
- Prevent ad-hoc z-index values and overlap bugs.

Tokens (see `src/constants/design-system.ts`)

- `Z_INDEX.CONTENT`: base content layer.
- `Z_INDEX.BANNER`: sticky banners below headers, above content.
- `Z_INDEX.HEADER`: desktop header/top bars.
- `Z_INDEX.HEADER_MOBILE`: mobile header/top bars.
- `Z_INDEX.FAB`: floating action buttons.
- `Z_INDEX.TOAST`: toast notifications.
- `Z_INDEX.MODAL`: modals, full-screen loading, blocking overlays.
- `Z_INDEX.TOOLTIP`: highest transient UI (tooltips/onboarding hints).

Header Size Tokens

- `HEADER.HEIGHT`: header height (`h-16`).
- `HEADER.TOP_OFFSET`: sticky offset below header (`top-16`).

Usage

- Headers: apply `Z_INDEX.HEADER`/`Z_INDEX.HEADER_MOBILE` on fixed header containers.
- Sticky banners under header: `sticky ${HEADER.TOP_OFFSET} ${Z_INDEX.BANNER}`.
- Content containers: prefer `Z_INDEX.CONTENT` if an explicit layer is needed.
- FABs: use `Z_INDEX.FAB`.
- Toasts: use `Z_INDEX.TOAST`.
- Modals / full-screen loaders: use `Z_INDEX.MODAL`.
- Tooltips / onboarding hints: use `Z_INDEX.TOOLTIP`.

Do

- Keep page-level banners within page shells (e.g., `BundlePageClient`).
- Keep shared UI (e.g., `WalletPortfolio`) free of page-specific banners.

Don’t

- Elevate a lower layer above headers to “fix” visibility; adjust offsets instead.
- Mix random z-index numbers with tokens.

Example

```tsx
// Banner below header
<div className={`sticky ${HEADER.TOP_OFFSET} ${Z_INDEX.BANNER}`}>...</div>

// Modal overlay
<div className={`fixed inset-0 ${Z_INDEX.MODAL}`}>...</div>
```
