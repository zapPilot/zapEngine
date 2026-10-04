// The Kokode site's palette (:root in apps/kokode-ai/src/styles/base.css).
// clinic.test.ts fails when the two drift.
export const theme = {
  bg: '#f5f5f7',
  surface: '#fff',
  ink: '#161617',
  muted: '#6e6e73',
  line: '#d2d2d7',
  blue: '#0071e3',
  blueHover: '#0077ed',
  blueSoft: '#e8f2fd',
  danger: '#d70015',
  dark: '#0d0d0f',
} as const;

/** The CSS custom property each token mirrors. */
export const CSS_VARIABLES: { readonly [Token in keyof typeof theme]: string } =
  {
    bg: '--bg',
    surface: '--surface',
    ink: '--ink',
    muted: '--muted',
    line: '--line',
    blue: '--blue',
    blueHover: '--blue-hover',
    blueSoft: '--blue-soft',
    danger: '--danger',
    dark: '--dark',
  };
