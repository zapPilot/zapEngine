import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(
  new URL('../scripts/install-playwright.mjs', import.meta.url),
);

describe('install-playwright postinstall helper', () => {
  it('skips the browser download during EAS native builds', () => {
    const output = execFileSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        EAS_BUILD: 'true',
      },
    });

    expect(output).toContain(
      'Skipping Playwright browser installation during EAS native builds.',
    );
  });
});
