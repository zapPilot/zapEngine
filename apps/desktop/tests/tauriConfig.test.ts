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
    windows: {
      title: string;
      width: number;
      height: number;
      resizable: boolean;
    }[];
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
  it('exposes Tauri dev and packaging scripts plus the Vite app scripts', async () => {
    const packageJson = await readJson<PackageJson>('package.json');

    expect(packageJson.scripts['dev']).toBe('tauri dev');
    expect(packageJson.scripts['build']).toBe('tauri build');
    expect(packageJson.scripts['package']).toBe('tauri build --bundles dmg');
    expect(packageJson.scripts['dev:web']).toBe('vite');
    expect(packageJson.scripts['build:web']).toBe('vite build');
  });

  it('points Tauri at the desktop Vite app dev server and production dist', async () => {
    const config = await readJson<TauriConfig>('src-tauri/tauri.conf.json');

    expect(config.productName).toBe('Zap Pilot');
    expect(config.identifier).toBe('com.zapengine.zappilot');
    expect(config.build.devUrl).toBe('http://localhost:3005');
    expect(config.build.frontendDist).toBe('../dist');
    expect(config.build.beforeDevCommand).toContain('VITE_APP_RUNTIME=desktop');
    expect(config.build.beforeDevCommand).toContain('@zapengine/desktop');
    expect(config.build.beforeDevCommand).toContain('dev:web');
    expect(config.build.beforeDevCommand).toContain('--port 3005');
    expect(config.build.beforeBuildCommand).toContain(
      'VITE_APP_RUNTIME=desktop',
    );
    expect(config.build.beforeBuildCommand).toContain(
      '--filter @zapengine/desktop build:web',
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
