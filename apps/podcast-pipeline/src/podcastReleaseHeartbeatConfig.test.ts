import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(process.cwd());
const flyToml = fs.readFileSync(path.join(appRoot, 'fly.toml'), 'utf8');
const dockerfile = fs.readFileSync(path.join(appRoot, 'Dockerfile'), 'utf8');

describe('podcast release heartbeat deployment wiring', () => {
  it('preloads the heartbeat before the always-on API process starts', () => {
    expect(flyToml).toContain(
      "app = 'node --import ./dist/release-heartbeat.js dist/index.js'",
    );
    expect(flyToml).toContain("render = 'node dist/worker.js'");
  });

  it('fails the image build when the preload entrypoint is missing', () => {
    expect(dockerfile).toContain('test -f /out/dist/release-heartbeat.js');
  });
});
