import { isCurrentScript, writeGeneratedFile } from './paths.js';
import { type DesignTokens, loadTokens } from './tokens.js';

const header = `/* Generated from packages/design-tokens/tokens.json. Do not edit by hand. */`;

export function renderCssVariables(tokens: DesignTokens): string {
  const { color, font, radius, easing } = tokens;

  return `${header}
:root,
.v2-root {
  --bg: ${color.bg};
  --bg-2: ${color['bg-2']};
  --surface: ${color.surface};
  --surface-elevated: ${color['surface-elevated']};
  --ink: ${color.ink};
  --ink-dim: ${color['ink-dim']};
  --ink-faint: ${color['ink-faint']};
  --line: ${color.line};
  --line-hi: ${color['line-hi']};
  --accent: ${color.accent};
  --accent-soft: ${color['accent-soft']};
  --accent-muted: ${color['accent-muted']};
  --error: ${color.error};
  --success: ${color.success};
  --spy: ${color.pillar.spy};
  --btc: ${color.pillar.btc};
  --usd: ${color.pillar.usd};
  --pillar-spy: ${color.pillar.spy};
  --pillar-btc: ${color.pillar.btc};
  --pillar-usd: ${color.pillar.usd};
  --font-serif-token: '${font.serif}';
  --font-mono-token: '${font.mono}';
  --font-sans-token: '${font.sans}';
  --radius-pill: ${radius.pill}px;
  --radius-subtle: ${radius.subtle}px;
  --radius-control: ${radius.control}px;
  --radius-card: ${radius.card}px;
  --easing-primary: ${easing.primary};

  --background: var(--bg);
  --foreground: var(--ink);
  --color-fd-background: var(--bg);
  --color-fd-foreground: var(--ink);
  --color-fd-muted: var(--bg-2);
  --color-fd-muted-foreground: var(--ink-dim);
  --color-fd-popover: var(--bg-2);
  --color-fd-popover-foreground: var(--ink);
  --color-fd-card: var(--bg-2);
  --color-fd-card-foreground: var(--ink);
  --color-fd-border: var(--line);
  --color-fd-primary: var(--accent);
  --color-fd-primary-foreground: var(--bg);
  --color-fd-secondary: var(--surface-elevated);
  --color-fd-secondary-foreground: var(--ink);
  --color-fd-accent: var(--accent-soft);
  --color-fd-accent-foreground: var(--ink);
  --color-fd-ring: var(--accent);
}
`;
}

export function writeCssVariables(): void {
  writeGeneratedFile(
    'dist/css/variables.css',
    renderCssVariables(loadTokens()),
  );
}

if (isCurrentScript(import.meta.url)) {
  writeCssVariables();
}
