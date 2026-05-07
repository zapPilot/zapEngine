declare const tailwindPreset: {
    theme: {
        extend: {
            colors: {
                bg: string;
                'bg-2': string;
                ink: string;
                'ink-dim': string;
                'ink-faint': string;
                line: string;
                'line-hi': string;
                accent: string;
                'accent-soft': string;
                spy: string;
                btc: string;
                usd: string;
            };
            fontFamily: {
                serif: string[];
                mono: string[];
                sans: string[];
            };
            borderRadius: {
                pill: string;
                subtle: string;
                control: string;
                card: string;
            };
            transitionTimingFunction: {
                primary: string;
            };
        };
    };
};
export default tailwindPreset;
//# sourceMappingURL=tailwind-preset.d.ts.map