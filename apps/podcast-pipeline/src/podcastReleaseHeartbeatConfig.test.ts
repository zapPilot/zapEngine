import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(process.cwd());
const flyToml = fs.readFileSync(path.join(appRoot, 'fly.toml'), 'utf8');
const dockerfile = fs.readFileSync(path.join(appRoot, 'Dockerfile'), 'utf8');

function readProcessesBlock(toml: string): string {
  const start = toml.indexOf('[processes]');
  if (start === -1) return '';
  const rest = toml.slice(start + '[processes]'.length);
  const nextTableOffset = rest.indexOf('\n[');
  return nextTableOffset === -1 ? rest : rest.slice(0, nextTableOffset);
}

function findProcessLine(block: string, name: string): string {
  return (
    block
      .split('\n')
      .find((line) => line.trimStart().startsWith(`${name} =`)) ?? ''
  );
}

describe('podcast release heartbeat deployment wiring', () => {
  it('preloads the heartbeat before the always-on API process starts', () => {
    // Pin the assertions to the [processes] table so the top-level
    // `app = 'from-fed-to-chain-api'` cannot satisfy them by accident.
    const processesBlock = readProcessesBlock(flyToml);
    expect(processesBlock, '[processes] table in fly.toml').not.toBe('');

    // The always-on `app` process must preload the release heartbeat before
    // the API entrypoint. The exact line may also carry other --import
    // preloads (e.g. the durable completion-notifier loop) alongside it.
    const appLine = findProcessLine(processesBlock, 'app');
    const heartbeatPreload = '--import ./dist/release-heartbeat.js';
    const apiEntrypoint = 'dist/index.js';
    const heartbeatIdx = appLine.indexOf(heartbeatPreload);
    const apiIdx = appLine.indexOf(apiEntrypoint);
    expect(
      heartbeatIdx,
      'release-heartbeat preload on the app line',
    ).toBeGreaterThanOrEqual(0);
    expect(apiIdx, 'API entrypoint after the preload').toBeGreaterThan(
      heartbeatIdx,
    );

    // The `render` process is the on-demand worker
    const renderLine = findProcessLine(processesBlock, 'render');
    expect(renderLine).toBe("  render = 'node dist/worker.js'");
  });

  it('fails the image build when the preload entrypoint is missing', () => {
    expect(dockerfile).toContain('test -f /out/dist/release-heartbeat.js');
  });
});
