import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { tokens } from '../src/generated/tokens.js';
import { packageRoot } from '../src/paths.js';
import {
  buildPrettierOptions,
  renderTsTokens,
  runTsCodegenCli,
  writeTsTokens,
} from '../src/ts-codegen.js';
import { loadTokens } from '../src/tokens.js';

describe('ts tokens codegen', () => {
  it('generated module carries the same values as tokens.json', () => {
    expect(tokens).toEqual(loadTokens());
  });

  it('checked-in generated file matches a fresh codegen run', async () => {
    const onDisk = readFileSync(
      join(packageRoot, 'src/generated/tokens.ts'),
      'utf8',
    );
    expect(onDisk).toBe(await renderTsTokens(loadTokens()));
  });

  it('writes the generated module deterministically', async () => {
    await writeTsTokens();
    await runTsCodegenCli(pathToFileURL(process.argv[1] ?? '').href);
    await runTsCodegenCli(pathToFileURL('/definitely/not-current.ts').href);

    expect(
      readFileSync(join(packageRoot, 'src/generated/tokens.ts'), 'utf8'),
    ).toBe(await renderTsTokens(loadTokens()));
  });

  it('builds formatter options with and without repository config', () => {
    expect(buildPrettierOptions(null)).toEqual({ parser: 'typescript' });
    expect(buildPrettierOptions({ singleQuote: true })).toEqual({
      singleQuote: true,
      parser: 'typescript',
    });
  });
});
