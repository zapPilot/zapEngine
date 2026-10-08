import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tokens } from '@zapengine/design-tokens/tokens';
import { expect, it } from 'vitest';
import { palette } from '@/lib/palette';
const require = createRequire(import.meta.url);
const resolveConfig = require('tailwindcss/resolveConfig');
const theme = resolveConfig(require('../tailwind.config.js')).theme;
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory()
      ? sources(file)
      : /\.tsx?$/.test(file)
        ? [readFileSync(file, 'utf8')]
        : [];
  });
}
it('resolves every canonical token utility and replaces default radii', () => {
  for (const [role, value] of Object.entries(palette))
    expect(theme.colors[role]).toBe(value);
  expect(theme.colors.sleeve).toEqual(tokens.sleeve.night);
  expect(Object.keys(theme.borderRadius).sort()).toEqual(
    Object.keys(tokens.radius).sort(),
  );
  for (const [role, spec] of Object.entries(tokens.font.native))
    expect([theme.fontFamily[role]].flat()).toContain(spec.family);
  for (const [role, spec] of Object.entries(tokens.type)) {
    expect(theme.fontSize[role][0]).toBe(`${spec.size}px`);
    expect(theme.fontSize[role][1].letterSpacing).toBe(
      `${spec.tracking * spec.size}px`,
    );
  }
});
it('rejects retired token utilities and sign pigment as text throughout native source', () => {
  const retired =
    /\b(?:bg-(?:bg|surface(?:-elevated|-high)?|accent(?:-soft|-subtle)?|success|warning|danger)|text-(?:sign(?!-ink)|accent(?:-soft|-subtle)?|success|warning|danger|ink-(?:dim|muted|faint))|border-(?:line(?:-hi)?|accent(?:-line)?|danger)|(?:bg|text|border)-pillar-\w+|rounded-(?:pill|full|tile|card|subtle|sm|md|lg|xl|2xl)|font-(?:serif|sans(?:-semibold|-bold)?))\b/g;
  for (const source of sources(join(import.meta.dirname, '../src'))) {
    expect(source.match(retired)).toBeNull();
    expect(source).not.toMatch(
      /#(?:d4c5a3|9a8f78|ff6f61|7ad88f)\b|rgba?\(\s*212\s*[, ]\s*197\s*[, ]\s*163/i,
    );
  }
});
