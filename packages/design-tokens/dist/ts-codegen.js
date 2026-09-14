import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { isCurrentScript, packageRoot, writeGeneratedFile } from './paths.js';
import { loadTokens } from './tokens.js';
// Unlike the CSS/Dart outputs, this one lands inside src/ where `format` and
// lint-staged run prettier — format the output at codegen time so repeated
// runs and formatting passes are both diff-clean.
const outputPath = 'src/generated/tokens.ts';
export function buildPrettierOptions(config) {
  return { ...(config ?? {}), parser: 'typescript' };
}
export async function renderTsTokens(tokens) {
  const source = `// Generated from packages/design-tokens/tokens.json. Do not edit by hand.
import type { DesignTokens } from '../tokens.js';

export const tokens = ${JSON.stringify(tokens, null, 2)} as const satisfies DesignTokens;
`;
  const config = await resolveConfig(join(packageRoot, outputPath));
  return format(source, buildPrettierOptions(config));
}
export async function writeTsTokens() {
  writeGeneratedFile(outputPath, await renderTsTokens(loadTokens()));
}
export async function runTsCodegenCli(metaUrl) {
  if (isCurrentScript(metaUrl)) {
    await writeTsTokens();
  }
}
await runTsCodegenCli(import.meta.url);
//# sourceMappingURL=ts-codegen.js.map
