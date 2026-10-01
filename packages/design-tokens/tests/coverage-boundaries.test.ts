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
    first.color.bg = '#changed-in-test';
    expect(loadTokens()).toEqual(expected);
  });

  it('renders every CSS token family without obsolete or colliding names', () => {
    const tokens = loadTokens();
    const css = renderCssVariables(tokens);
    const { pillar, ...colors } = tokens.color;
    for (const [name, value] of Object.entries({ ...colors, ...pillar })) {
      expect(css).toContain(`  --${name}: ${value};`);
    }
    for (const [name, value] of Object.entries(tokens.radius)) {
      expect(css).toContain(`  --radius-${name}: ${value}px;`);
    }
    for (const [name, role] of Object.entries(tokens.type)) {
      for (const [field, value] of Object.entries(role)) {
        expect(css).toContain(`  --type-${name}-${field}: ${value}px;`);
      }
    }
    for (const [name, value] of Object.entries(tokens.shadow))
      expect(css).toContain(`--shadow-${name}: ${value.css};`);
    for (const [name, value] of Object.entries(tokens.easing))
      expect(css).toContain(`--easing-${name}: ${value};`);
    for (const [name, value] of Object.entries(tokens.duration))
      expect(css).toContain(`--duration-${name}: ${value}ms;`);
    expect(css).toMatch(
      /^\/\* Generated from .* Do not edit by hand\. \*\/\n:root \{/,
    );
    for (const obsolete of [
      '--bg-2:',
      '--error:',
      '--pillar-',
      '--font-',
      '--container-',
      '--breakpoint-',
      '--motion-',
      '--gutter-',
      '--size-',
      '.v2-root',
    ])
      expect(css).not.toContain(obsolete);
    expect(css.endsWith('\n')).toBe(true);
  });

  it('preserves landing and control-center consumer variable contracts', () => {
    const css = renderCssVariables(loadTokens());
    const names = [
      'bg',
      'surface',
      'surface-elevated',
      'ink',
      'ink-dim',
      'ink-faint',
      'line',
      'line-hi',
      'accent',
      'accent-soft',
      'accent-muted',
      'danger',
      'warning',
      'success',
      'spy',
      'btc',
      'usd',
      'radius-pill',
      'radius-subtle',
      'radius-control',
      'radius-tile',
      'radius-card',
      'easing-primary',
      'background',
      'foreground',
    ];
    for (const name of names) expect(css).toContain(`--${name}:`);
    for (const [name, target] of Object.entries({
      background: 'bg',
      foreground: 'ink',
      muted: 'surface',
      card: 'surface',
      primary: 'accent',
      warning: 'warning',
      error: 'danger',
      success: 'success',
    })) {
      expect(css).toContain(`--color-fd-${name}: var(--${target});`);
    }
    expect(css).toContain('--background: var(--bg);');
    expect(css).toContain('--foreground: var(--ink);');
  });

  it('keeps readable muted text above the small-text AA contrast threshold', () => {
    const luminance = (hex: string) => {
      const channels = [1, 3, 5]
        .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
        .map((value) =>
          value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
        );
      return (
        channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
      );
    };
    const tokens = loadTokens();
    for (const surface of [
      tokens.color.bg,
      tokens.color.surface,
      tokens.color['surface-elevated'],
    ]) {
      expect(
        (luminance(tokens.color['ink-muted']) + 0.05) /
          (luminance(surface) + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      Math.min(...Object.values(tokens.type).map((role) => role.size)),
    ).toBe(11);
    expect(tokens.size.hit).toBeGreaterThanOrEqual(44);
  });

  it('writes the checked-in CSS output deterministically', () => {
    writeCssVariables();
    runCssVariablesCli(pathToFileURL(process.argv[1] ?? '').href);
    runCssVariablesCli(pathToFileURL('/definitely/not-current.ts').href);

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
