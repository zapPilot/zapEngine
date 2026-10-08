import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const tokens = readFileSync(
  new URL('../../design-tokens/dist/css/variables.css', import.meta.url),
  'utf8',
);
it('uses only v3 roles and local geometry variables, without recreating the palette', () => {
  const definitions = new Set(
    [
      ...css.matchAll(/(--[\w-]+)\s*:/g),
      ...tokens.matchAll(/(--[\w-]+)\s*:/g),
    ].map((m) => m[1]),
  );
  const undefinedNames = [...css.matchAll(/var\((--[\w-]+)/g)]
    .map((m) => m[1])
    .filter((name) => !definitions.has(name));
  expect(undefinedNames).toEqual([]);
  expect(css).not.toMatch(
    /var\(--(?:paper|m-|b-|fl\b|btc\b|eth\b|spy\b|stable\b)/,
  );
  expect(css).not.toMatch(/(?:^|[;{])\s*color:\s*var\(--sign\)/);
  expect(css).toContain('height: 6600px');
  expect(css).toContain('height: 3400px');
  expect(css).toContain('prefers-reduced-motion');
  expect(css).toContain('container-type: size');
});
