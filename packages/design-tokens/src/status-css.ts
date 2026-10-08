import { format } from 'prettier';
import { isCurrentScript, writeGeneratedFile } from './paths.js';
import { loadTokens, type DesignTokens } from './tokens.js';
const backgrounds = {
  filled: 'currentColor',
  half: 'linear-gradient(90deg, currentColor 50%, transparent 50%)',
  'center-dot':
    'radial-gradient(circle, currentColor 0 1.6px, transparent 2.1px)',
  'dashed-ring': 'transparent',
};
export async function renderStatusCss(tokens: DesignTokens): Promise<string> {
  const rules = Object.entries(tokens.status).map(
    ([status, shape]) =>
      `.status-glyph[data-status="${status}"] { background: ${backgrounds[shape.glyph]}; border-style: ${shape.glyph === 'dashed-ring' ? 'dashed' : 'solid'}; }\n.status-rail[data-status="${status}"] { border-top-style: ${shape.line}; }`,
  );
  return format(
    `/* Generated from tokens.status. Do not edit by hand. */\n.status-glyph { display: inline-block; width: 12px; height: 12px; border: 2px solid currentColor; border-radius: 50%; box-sizing: border-box; flex: none; }\n.status-rail { border-top-width: var(--line-rail); border-top-color: currentColor; }\n${rules.join('\n')}\n`,
    { parser: 'css', singleQuote: true },
  );
}
export async function writeStatusCss(): Promise<void> {
  writeGeneratedFile(
    'dist/css/status.css',
    await renderStatusCss(loadTokens()),
  );
}
export async function runStatusCssCli(metaUrl: string): Promise<void> {
  if (isCurrentScript(metaUrl)) {
    await writeStatusCss();
  }
}
await runStatusCssCli(import.meta.url);
