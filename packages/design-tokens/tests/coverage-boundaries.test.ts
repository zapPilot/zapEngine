import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { renderCssVariables, writeCssVariables } from '../src/css-variables.js';
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
    first.color.bg = '#changed-in-test';
    expect(loadTokens()).toEqual(expected);
  });

  it('renders every token family and compatibility alias', () => {
    const tokens = loadTokens();
    const css = renderCssVariables(tokens);
    const declarations = [
      ['--bg', tokens.color.bg],
      ['--bg-2', tokens.color['bg-2']],
      ['--surface', tokens.color.surface],
      ['--surface-elevated', tokens.color['surface-elevated']],
      ['--ink', tokens.color.ink],
      ['--ink-dim', tokens.color['ink-dim']],
      ['--ink-faint', tokens.color['ink-faint']],
      ['--line', tokens.color.line],
      ['--line-hi', tokens.color['line-hi']],
      ['--accent', tokens.color.accent],
      ['--accent-soft', tokens.color['accent-soft']],
      ['--accent-muted', tokens.color['accent-muted']],
      ['--error', tokens.color.error],
      ['--warning', tokens.color.warning],
      ['--success', tokens.color.success],
      ['--spy', tokens.color.pillar.spy],
      ['--btc', tokens.color.pillar.btc],
      ['--usd', tokens.color.pillar.usd],
      ['--radius-pill', `${tokens.radius.pill}px`],
      ['--radius-subtle', `${tokens.radius.subtle}px`],
      ['--radius-control', `${tokens.radius.control}px`],
      ['--radius-card', `${tokens.radius.card}px`],
      ['--easing-primary', tokens.easing.primary],
    ] as const;

    expect(css).toMatch(/^\/\* Generated from .* Do not edit by hand\. \*\//);
    for (const [name, value] of declarations) {
      expect(css).toContain(`  ${name}: ${value};`);
    }
    expect(css).toContain(`--font-serif-token: '${tokens.font.serif}';`);
    expect(css).toContain(`--font-mono-token: '${tokens.font.mono}';`);
    expect(css).toContain(`--font-sans-token: '${tokens.font.sans}';`);
    expect(css).toContain('--background: var(--bg);');
    expect(css).toContain('--color-fd-primary: var(--accent);');
    expect(css).toContain('--color-fd-card-foreground: var(--ink);');
    expect(css.endsWith('\n')).toBe(true);
  });

  it('writes the checked-in CSS output deterministically', () => {
    writeCssVariables();
    expect(
      readFileSync(join(packageRoot, 'dist/css/variables.css'), 'utf8'),
    ).toBe(renderCssVariables(loadTokens()));
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

  it('creates missing parent directories and overwrites by path', () => {
    const relativePath = '.test-output/nested/generated.txt';
    const outputPath = join(packageRoot, relativePath);
    writeGeneratedFile(relativePath, 'first');
    expect(readFileSync(outputPath, 'utf8')).toBe('first');
    writeGeneratedFile(relativePath, 'replacement');
    expect(readFileSync(outputPath, 'utf8')).toBe('replacement');
  });
});
