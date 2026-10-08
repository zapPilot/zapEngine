import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tokens } from '@zapengine/design-tokens/tokens';
import { expect, it } from 'vitest';
it('inherits paper roles and only declares the documented operational health exceptions', () => {
  const css = readFileSync(
    resolve(process.cwd(), 'src/client/styles.css'),
    'utf8',
  );
  for (const role of Object.keys(tokens.mode.paper)) {
    expect(css).not.toMatch(new RegExp(`--${role}\\s*:`));
  }
  expect(css).not.toMatch(
    /--(?:bg-2|error|pillar-spy)\b|color:\s*var\(--sign\)|box-shadow:[^;]*(?:rgb|#[\da-f])/i,
  );
  expect(css).toContain('--cc-tone-healthy:');
  expect(css).toContain('--cc-tone-degraded:');
  expect(css).toContain('--status-critical: var(--alert)');
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  expect(html).not.toContain('fonts.googleapis.com');
  expect(html).toContain('#f4f4f1');
});
