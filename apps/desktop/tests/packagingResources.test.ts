import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('desktop packaging resources', () => {
  it('keeps the configured macOS icon available in a clean checkout', async () => {
    const builderConfig = await readFile(
      resolve(desktopRoot, 'electron-builder.yml'),
      'utf8',
    );
    const configuredIcon = 'build/icon.icns';

    expect(builderConfig).toContain(`icon: ${configuredIcon}`);
    await expect(access(resolve(desktopRoot, configuredIcon))).resolves.toBe(
      undefined,
    );
  });
});
