import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
const require = createRequire(import.meta.url);
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : /\.(css|tsx?)$/.test(entry.name) && !entry.name.includes('.test.')
        ? [join(directory, entry.name)]
        : [],
  );
}
const root = resolve(process.cwd(), 'src');
const retained = [
  ...files(join(root, 'components/track-record')),
  ...files(join(root, 'components/verifiable-strategy')),
  ...files(join(root, 'components/brand')),
  ...files(join(root, 'app/track-record')),
  join(root, 'app/globals.css'),
  ...files(join(root, 'app/distribution')),
  ...files(join(root, 'app/pitch')),
  join(root, 'app/landing-v2.css'),
  join(root, 'components/landing-v2/AppCtaLink.module.css'),
];
const css = readFileSync(
  require.resolve('@zapengine/design-tokens/css/variables.css'),
  'utf8',
);
it('defines every role used by retained routes and removes retired pigments and aliases', () => {
  const sources = retained.map((file) => readFileSync(file, 'utf8'));
  const definitions = new Set(
    [
      ...`${css}\n${sources.join('\n')}`.matchAll(/['"]?(--[\w-]+)['"]?\s*:/g),
    ].map((match) => match[1]),
  );
  for (const font of ['--font-archivo', '--font-martian'])
    definitions.add(font);
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]!;
    for (const match of source.matchAll(/var\((--[\w-]+)[,)]/g))
      expect(definitions.has(match[1]), `${retained[i]}: ${match[1]}`).toBe(
        true,
      );
    expect(source, retained[i]).not.toMatch(
      /var\(--(?:bg(?:-2)?|surface(?:-elevated|-high)?|ink-(?:dim|muted|faint)|line(?:-hi)?|accent(?:-[\w-]+)?|pillar-[\w-]+|danger|success|warning|font-(?:sans|serif))\)/,
    );
    expect(source, retained[i]).not.toMatch(
      /#(?:d4c5a3|7ad88f|ff6f61)\b|rgba?\(\s*212\s*[, ]\s*197\s*[, ]\s*163/i,
    );
    expect(source, retained[i]).not.toMatch(/\bcolor\s*:\s*var\(--sign\)/);
  }
});

it('keeps migrated distribution, pitch and CTA styles free of raw pigments', () => {
  const paths = [
    'app/distribution/distribution.css',
    'app/pitch/pitch.css',
    'app/landing-v2.css',
    'components/landing-v2/AppCtaLink.module.css',
  ];
  for (const path of paths)
    expect(readFileSync(join(root, path), 'utf8'), path).not.toMatch(
      /#[\da-f]{3,8}\b|rgba?\(/i,
    );
  expect(
    readFileSync(join(root, 'app/track-record/track-record.css'), 'utf8'),
  ).toContain('color-scheme: light;');
});
