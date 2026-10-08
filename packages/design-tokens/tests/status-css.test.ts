import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { loadTokens } from '../src/tokens.js';
import { packageRoot } from '../src/paths.js';
import {
  renderStatusCss,
  runStatusCssCli,
  writeStatusCss,
} from '../src/status-css.js';
function rule(css: string, element: string, status: string): string {
  const selector = `.${element}[data-status='${status}']`;
  const start = css.indexOf(selector);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}
it('uses specific shape and line grammar for every status and regenerates deterministically', async () => {
  const css = await renderStatusCss(loadTokens());
  expect(rule(css, 'status-glyph', 'live')).toContain(
    'background: currentColor;',
  );
  expect(rule(css, 'status-glyph', 'live')).toContain('border-style: solid;');
  expect(rule(css, 'status-glyph', 'in-development')).toContain(
    'linear-gradient(90deg, currentColor 50%, transparent 50%)',
  );
  expect(rule(css, 'status-glyph', 'research')).toContain('radial-gradient');
  expect(rule(css, 'status-glyph', 'planned')).toContain(
    'background: transparent;',
  );
  expect(rule(css, 'status-glyph', 'planned')).toContain(
    'border-style: dashed;',
  );
  expect(rule(css, 'status-rail', 'live')).toContain(
    'border-top-style: solid;',
  );
  for (const status of ['in-development', 'research', 'planned'])
    expect(rule(css, 'status-rail', status)).toContain(
      'border-top-style: dashed;',
    );
  await writeStatusCss();
  await runStatusCssCli(pathToFileURL(process.argv[1] ?? '').href);
  await runStatusCssCli(pathToFileURL('/not-current.ts').href);
  expect(readFileSync(join(packageRoot, 'dist/css/status.css'), 'utf8')).toBe(
    css,
  );
});
