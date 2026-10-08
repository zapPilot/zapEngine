import { format } from 'prettier';
import { isCurrentScript, writeGeneratedFile } from './paths.js';
import { MODES, loadTokens } from './tokens.js';
const header =
  '/* Generated from packages/design-tokens/tokens.json. Do not edit by hand. */';
function declarations(values, prefix = '', unit = '') {
  return Object.entries(values).map(
    ([key, value]) => `  --${prefix}${key}: ${value}${unit};`,
  );
}
export async function renderCssVariables(tokens) {
  const lines = [
    ...declarations(tokens.radius, 'radius-', 'px'),
    ...declarations(tokens.line, 'line-', 'px'),
    ...tokens.space.map((value, i) => `  --space-${i + 1}: ${value}px;`),
    ...declarations(tokens.duration, 'duration-', 'ms'),
    ...Object.entries(tokens.easing).map(
      ([name, points]) =>
        `  --easing-${name}: cubic-bezier(${points.join(', ')});`,
    ),
    ...['display', 'text', 'mono'].map(
      (role) =>
        `  --font-${role}: "${tokens.font[role].web}", ${tokens.font[role].fallback};`,
    ),
    ...Object.entries(tokens.type).flatMap(([name, type]) => [
      `  --type-${name}-size: ${type.size}px;`,
      `  --type-${name}-line: ${type.line}px;`,
      `  --type-${name}-tracking: ${type.tracking}em;`,
      `  --type-${name}-weight: ${type.weight};`,
      `  --type-${name}-width: ${type.width}%;`,
      `  --type-${name}-family: var(--font-${type.family});`,
      `  --type-${name}-case: ${type.case};`,
      `  --type-${name}-numeric: ${type.numeric};`,
    ]),
  ];
  const modes = MODES.map((mode) => {
    const selector =
      mode === 'paper'
        ? ':root, [data-theme="paper"]'
        : '[data-theme="night"], .dark';
    return `${selector} {\n${[
      ...declarations(tokens.mode[mode]),
      ...declarations(tokens.sleeve[mode], 'sleeve-'),
      ...declarations(tokens.material[mode], 'material-'),
      `  --shadow-overlay: ${tokens.shadow.overlay[mode].css};`,
    ].join('\n')}\n}`;
  });
  return format(
    `${header}\n:root {\n${lines.join('\n')}\n}\n${modes.join('\n')}\n`,
    { parser: 'css', singleQuote: true },
  );
}
export async function writeCssVariables() {
  writeGeneratedFile(
    'dist/css/variables.css',
    await renderCssVariables(loadTokens()),
  );
}
export async function runCssVariablesCli(metaUrl) {
  if (isCurrentScript(metaUrl)) {
    await writeCssVariables();
  }
}
await runCssVariablesCli(import.meta.url);
//# sourceMappingURL=css-variables.js.map
