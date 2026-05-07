import { loadTokens } from './tokens.js';
const tokens = loadTokens();
const tailwindPreset = {
    theme: {
        extend: {
            colors: {
                bg: tokens.color.bg,
                'bg-2': tokens.color['bg-2'],
                ink: tokens.color.ink,
                'ink-dim': tokens.color['ink-dim'],
                'ink-faint': tokens.color['ink-faint'],
                line: tokens.color.line,
                'line-hi': tokens.color['line-hi'],
                accent: tokens.color.accent,
                'accent-soft': tokens.color['accent-soft'],
                spy: tokens.color.pillar.spy,
                btc: tokens.color.pillar.btc,
                usd: tokens.color.pillar.usd,
            },
            fontFamily: {
                serif: [tokens.font.serif, 'Georgia', 'serif'],
                mono: [tokens.font.mono, 'ui-monospace', 'monospace'],
                sans: [tokens.font.sans, 'Inter', 'system-ui', 'sans-serif'],
            },
            borderRadius: {
                pill: `${tokens.radius.pill}px`,
                subtle: `${tokens.radius.subtle}px`,
                control: `${tokens.radius.control}px`,
                card: `${tokens.radius.card}px`,
            },
            transitionTimingFunction: {
                primary: tokens.easing.primary,
            },
        },
    },
};
export default tailwindPreset;
//# sourceMappingURL=tailwind-preset.js.map