import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface PackageJson {
  scripts: Record<string, string>;
}

interface TauriConfig {
  productName: string;
  identifier: string;
  build: {
    beforeBuildCommand: string;
    beforeDevCommand: string;
    devUrl: string;
    frontendDist: string;
  };
  app: {
    windows: Array<{
      title: string;
      width: number;
      height: number;
      resizable: boolean;
    }>;
  };
  bundle: {
    active: boolean;
    targets: string[];
    icon: string[];
  };
}

const testDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(testDir, '..');

async function readJson<T>(relativePath: string): Promise<T> {
  const json = await readFile(path.join(desktopRoot, relativePath), 'utf8');
  return JSON.parse(json) as T;
}

describe('desktop Tauri shell configuration', () => {
  it('exposes Tauri dev and packaging scripts', async () => {
    const packageJson = await readJson<PackageJson>('package.json');

    expect(packageJson.scripts['dev']).toBe('tauri dev');
    expect(packageJson.scripts['build']).toBe('tauri build');
    expect(packageJson.scripts['package']).toBe('tauri build --bundles dmg');
  });

  it('points Tauri at the frontend dev server and production dist', async () => {
    const config = await readJson<TauriConfig>('src-tauri/tauri.conf.json');

    expect(config.productName).toBe('Zap Pilot');
    expect(config.identifier).toBe('com.zapengine.zappilot');
    expect(config.build.devUrl).toBe('http://localhost:3000');
    expect(config.build.frontendDist).toBe('../../frontend/dist');
    expect(config.build.beforeDevCommand).toContain('VITE_APP_RUNTIME=desktop');
    expect(config.build.beforeDevCommand).toContain('@zapengine/frontend');
    expect(config.build.beforeDevCommand).toContain('--port 3000');
    expect(config.build.beforeBuildCommand).toContain(
      'VITE_APP_RUNTIME=desktop',
    );
    expect(config.build.beforeBuildCommand).toContain(
      '--filter @zapengine/frontend build',
    );
  });

  it('keeps the first Mac shell a manual-review desktop wrapper', async () => {
    const config = await readJson<TauriConfig>('src-tauri/tauri.conf.json');
    const [windowConfig] = config.app.windows;

    expect(windowConfig).toEqual(
      expect.objectContaining({
        title: 'Zap Pilot',
        width: 1280,
        height: 840,
        resizable: true,
      }),
    );
    expect(config.bundle.active).toBe(true);
    expect(config.bundle.targets).toEqual(['app', 'dmg']);
  });

  it('references committed desktop icon assets', async () => {
    const config = await readJson<TauriConfig>('src-tauri/tauri.conf.json');

    await Promise.all(
      config.bundle.icon.map(async (iconPath) => {
        await expect(
          access(path.join(desktopRoot, 'src-tauri', iconPath)),
        ).resolves.toBeUndefined();
      }),
    );
  });
});
