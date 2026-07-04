// Theme values come from the design-tokens source of truth (tokens.json) so
// the RN app, web CSS variables, and (until retirement) Dart constants never
// drift. RN has no font-weight matching for runtime-loaded fonts, so each
// weight is its own fontFamily entry.
const t = require('@zapengine/design-tokens/tokens.json');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: t.color.bg,
        'bg-2': t.color['bg-2'],
        surface: t.color.surface,
        'surface-elevated': t.color['surface-elevated'],
        ink: t.color.ink,
        'ink-dim': t.color['ink-dim'],
        'ink-faint': t.color['ink-faint'],
        line: t.color.line,
        'line-hi': t.color['line-hi'],
        accent: t.color.accent,
        'accent-soft': t.color['accent-soft'],
        'accent-muted': t.color['accent-muted'],
        error: t.color.error,
        success: t.color.success,
        spy: t.color.pillar.spy,
        btc: t.color.pillar.btc,
        usd: t.color.pillar.usd,
      },
      fontFamily: {
        serif: 'InstrumentSerif',
        sans: 'Geist',
        'sans-medium': 'Geist-Medium',
        'sans-semibold': 'Geist-SemiBold',
        'sans-bold': 'Geist-Bold',
        mono: 'JetBrainsMono',
        'mono-medium': 'JetBrainsMono-Medium',
        'mono-semibold': 'JetBrainsMono-SemiBold',
        'mono-bold': 'JetBrainsMono-Bold',
      },
      borderRadius: {
        pill: `${t.radius.pill}px`,
        subtle: `${t.radius.subtle}px`,
        control: `${t.radius.control}px`,
        card: `${t.radius.card}px`,
      },
    },
  },
};
