import { isCurrentScript, writeGeneratedFile } from './paths.js';
import { type DesignTokens, loadTokens } from './tokens.js';

const header =
  '/* Generated from packages/design-tokens/tokens.json. Do not edit by hand. */';

type CssTree = { [key: string]: string | number | CssTree };
function declarations(values: CssTree, prefix = '', unit = ''): string[] {
  return Object.entries(values).flatMap(([key, value]) => {
    const name = prefix ? `${prefix}-${key}` : key;
    return typeof value === 'object'
      ? declarations(value, name, unit)
      : [`  --${name}: ${value}${unit};`];
  });
}

export function renderCssVariables(tokens: DesignTokens): string {
  const { pillar, ...colors } = tokens.color;
  const lines = [
    ...declarations({ ...colors, ...pillar }),
    ...declarations(tokens.radius, 'radius', 'px'),
    ...declarations(tokens.type, 'type', 'px'),
    ...declarations(
      Object.fromEntries(
        Object.entries(tokens.shadow).map(([name, value]) => [name, value.css]),
      ),
      'shadow',
    ),
    ...declarations(tokens.easing, 'easing'),
    ...declarations(tokens.duration, 'duration', 'ms'),
  ];
  const aliases = {
    background: 'bg',
    foreground: 'ink',
    'color-fd-background': 'bg',
    'color-fd-foreground': 'ink',
    'color-fd-muted': 'surface',
    'color-fd-muted-foreground': 'ink-dim',
    'color-fd-popover': 'surface-elevated',
    'color-fd-popover-foreground': 'ink',
    'color-fd-card': 'surface',
    'color-fd-card-foreground': 'ink',
    'color-fd-border': 'line',
    'color-fd-primary': 'accent',
    'color-fd-primary-foreground': 'ink-inverse',
    'color-fd-secondary': 'surface-elevated',
    'color-fd-secondary-foreground': 'ink',
    'color-fd-accent': 'accent-soft',
    'color-fd-accent-foreground': 'ink',
    'color-fd-ring': 'accent',
    'color-fd-info': 'accent',
    'color-fd-warning': 'warning',
    'color-fd-error': 'danger',
    'color-fd-success': 'success',
  };
  lines.push(
    ...Object.entries(aliases).map(
      ([name, target]) => `  --${name}: var(--${target});`,
    ),
  );
  return `${header}\n:root {\n${lines.join('\n')}\n}\n`;
}

export function writeCssVariables(): void {
  writeGeneratedFile(
    'dist/css/variables.css',
    renderCssVariables(loadTokens()),
  );
}
export function runCssVariablesCli(metaUrl: string): void {
  if (isCurrentScript(metaUrl)) {
    writeCssVariables();
  }
}
runCssVariablesCli(import.meta.url);
