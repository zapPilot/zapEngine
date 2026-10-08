import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  renderCssVariables,
  runCssVariablesCli,
  writeCssVariables,
} from '../src/css-variables.js';
import {
  isCurrentScript,
  packageRoot,
  writeGeneratedFile,
} from '../src/paths.js';
import { loadTokens } from '../src/tokens.js';

const scratchDirectory = join(packageRoot, '.test-output');

afterEach(() => {
  rmSync(scratchDirectory, { recursive: true, force: true });
});

describe('design-token loading and CSS generation', () => {
  it('loads a fresh copy of the canonical JSON on every call', () => {
    const expected = JSON.parse(
      readFileSync(join(packageRoot, 'tokens.json'), 'utf8'),
    );
    const first = loadTokens();

    expect(first).toEqual(expected);
    first.mode.paper.ground = '#changed-in-test';
    expect(loadTokens()).toEqual(expected);
  });

  it('emits mode roles, sleeve/material roles and typed global variables without legacy aliases', async () => {
    const tokens = loadTokens();
    const css = await renderCssVariables(tokens);
    const normalized = css.replace(/\s/g, '').replace(/\b0\./g, '.');
    const valueOf = (value: string) =>
      value.replace(/\s/g, '').replace(/\b0\./g, '.');
    expect(css).toMatch(/:root,\s*\[data-theme=['"]paper['"]\]/);
    expect(css).toMatch(/\[data-theme=['"]night['"]\],\s*\.dark/);
    for (const mode of ['paper', 'night'] as const) {
      for (const [name, value] of Object.entries(tokens.mode[mode]))
        expect(normalized).toContain(`--${name}:${valueOf(value)};`);
      for (const [name, value] of Object.entries(tokens.sleeve[mode]))
        expect(normalized).toContain(`--sleeve-${name}:${valueOf(value)};`);
      for (const [name, value] of Object.entries(tokens.material[mode]))
        expect(normalized).toContain(`--material-${name}:${valueOf(value)};`);
    }
    expect(Object.keys(tokens.mode.paper)).toEqual(
      Object.keys(tokens.mode.night),
    );
    for (const [name, value] of Object.entries(tokens.radius))
      expect(css).toContain(`--radius-${name}: ${value}px;`);
    for (const [name, value] of Object.entries(tokens.type))
      expect(css).toContain(`--type-${name}-tracking: ${value.tracking}em;`);
    expect(css).toContain('--easing-scene: cubic-bezier(0.16, 1, 0.3, 1);');
    expect(css).toContain('--space-9: 104px;');
    expect(normalized.replace(/['"]/g, '')).toContain(
      '--font-mono:MartianMonoVariable,',
    );
    expect(css).not.toMatch(
      /--(?:background|foreground|color-|container-|breakpoint-|spacing|ease-|text-|bg:|accent:|radius-pill)/,
    );
    expect(css.endsWith('\n')).toBe(true);
  });

  it('writes the checked-in CSS output deterministically', async () => {
    await writeCssVariables();
    await runCssVariablesCli(pathToFileURL(process.argv[1] ?? '').href);
    await runCssVariablesCli(pathToFileURL('/definitely/not-current.ts').href);

    expect(
      readFileSync(join(packageRoot, 'dist/css/variables.css'), 'utf8'),
    ).toBe(await renderCssVariables(loadTokens()));
  });
});

describe('codegen path helpers', () => {
  it('recognizes only the current entry script', () => {
    expect(isCurrentScript(pathToFileURL(process.argv[1] ?? '').href)).toBe(
      true,
    );
    expect(
      isCurrentScript(pathToFileURL('/definitely/not-current.ts').href),
    ).toBe(false);
  });

  it('handles a missing argv entry', () => {
    const original = process.argv[1];
    try {
      (process.argv as Array<string | undefined>)[1] = undefined;
      expect(isCurrentScript(pathToFileURL('').href)).toBe(true);
    } finally {
      process.argv[1] = original;
    }
  });

  it('creates missing parent directories and overwrites by path', () => {
    const relativePath = '.test-output/nested/generated.txt';
    const outputPath = join(packageRoot, relativePath);
    writeGeneratedFile(relativePath, 'first');
    expect(readFileSync(outputPath, 'utf8')).toBe('first');
    writeGeneratedFile(relativePath, 'replacement');
    expect(readFileSync(outputPath, 'utf8')).toBe('replacement');
  });
});
