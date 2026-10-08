import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const require = createRequire(import.meta.url);
it('packages the exact variable fonts referenced by next/font/local', () => {
  const files = [
    require.resolve('@fontsource-variable/archivo/files/archivo-latin-standard-normal.woff2'),
    require.resolve('@fontsource-variable/martian-mono/files/martian-mono-latin-standard-normal.woff2'),
  ];
  const layout = readFileSync(require.resolve('../layout.tsx'), 'utf8');
  for (const file of files) {
    expect(readFileSync(file).toString('ascii', 0, 4)).toBe('wOF2');
    expect(layout).toContain(file.split('/node_modules/').at(-1));
  }
});
