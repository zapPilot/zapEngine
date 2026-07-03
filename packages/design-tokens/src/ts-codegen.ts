import { join } from 'node:path';

import { format, resolveConfig } from 'prettier';

import { isCurrentScript, packageRoot, writeGeneratedFile } from './paths.js';
import { type DesignTokens, loadTokens } from './tokens.js';

// Unlike the CSS/Dart outputs, this one lands inside src/ where `format` and
// lint-staged run prettier — format the output at codegen time so repeated
// runs and formatting passes are both diff-clean.
const outputPath = 'src/generated/tokens.ts';

export async function renderTsTokens(tokens: DesignTokens): Promise<string> {
  const source = `// Generated from packages/design-tokens/tokens.json. Do not edit by hand.
import type { DesignTokens } from '../tokens.js';

export const tokens = ${JSON.stringify(tokens, null, 2)} as const satisfies DesignTokens;
`;

  const config = await resolveConfig(join(packageRoot, outputPath));
  return format(source, { ...(config ?? {}), parser: 'typescript' });
}

export async function writeTsTokens(): Promise<void> {
  writeGeneratedFile(outputPath, await renderTsTokens(loadTokens()));
}

if (isCurrentScript(import.meta.url)) {
  await writeTsTokens();
}
