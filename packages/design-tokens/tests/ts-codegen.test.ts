import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { tokens } from '../src/generated/tokens.js';
import { packageRoot } from '../src/paths.js';
import { renderTsTokens } from '../src/ts-codegen.js';
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
});
