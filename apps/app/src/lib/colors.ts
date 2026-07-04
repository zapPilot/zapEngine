import { tokens } from '@zapengine/design-tokens/tokens';

const CSS_TOKEN_COLORS: Record<string, string> = {
  'var(--accent)': tokens.color.accent,
  'var(--btc)': tokens.color.pillar.btc,
  'var(--spy)': tokens.color.pillar.spy,
  'var(--usd)': tokens.color.pillar.usd,
};

export function resolveColor(color: string): string {
  return CSS_TOKEN_COLORS[color] ?? color;
}
