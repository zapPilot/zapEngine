import { chmod, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { hash } from '../test-utils/fixtures.js';
import { argumentsFor } from './arguments.js';
import { readEnv } from './env.js';
import {
  initLocal,
  localPaths,
  readAgentKey,
  readMultibaasConfig,
} from './local.js';

const episode = '11111111-1111-4111-8111-111111111111';
afterEach(() => vi.unstubAllEnvs());

describe('arguments', () => {
  it('parses each command with pnpm separators and defaults', () => {
    expect(argumentsFor(['--', 'init'])).toMatchObject({
      command: 'init',
      execute: false,
      layaUrl: 'http://127.0.0.1:8000',
    });
    expect(
      argumentsFor([
        'init',
        '--multibaas-url',
        'https://mb.example',
        '--multibaas-key-file',
        'mb-key.txt',
      ]),
    ).toMatchObject({
      multibaasUrl: 'https://mb.example',
      multibaasKeyFile: 'mb-key.txt',
    });
    expect(
      argumentsFor([
        'demo',
        '--episode',
        episode,
        '--execute',
        '--chat=-100123',
        '--laya-url',
        'http://127.0.0.1:9000',
      ]),
    ).toMatchObject({
      command: 'demo',
      episode,
      execute: true,
      chat: '-100123',
      layaUrl: 'http://127.0.0.1:9000',
    });
    expect(
      argumentsFor(['demo', '--episode', episode, '--replay', hash]).replay,
    ).toBe(hash);
    expect(argumentsFor(['multibaas-setup']).command).toBe('multibaas-setup');
  });
  it.each([
    [['demo', '--execute']],
    [['demo', '--replay', hash]],
    [['demo', '--episode', episode, '--execute', '--replay', hash]],
    [['demo', '--episode', 'not-a-uuid']],
    [['demo', '--episode', episode, '--replay', '0x12']],
    [['demo', '--chat', 'abc']],
    [['init', '--multibaas-url', 'https://mb.example']],
    [['init', '--multibaas-url', 'nope', '--multibaas-key-file', 'k']],
    [['demo', 'extra']],
    [['run']],
  ])('rejects %j', (argv) => {
    expect(() => argumentsFor(argv)).toThrow();
  });
});

it('reads only the four Infisical-backed keys', () => {
  vi.stubEnv('ACCOUNT_API_URL', 'https://account.example');
  vi.stubEnv('PODCAST_API_URL', 'https://podcast.example');
  vi.stubEnv('PIPELINE_TELEGRAM_BOT_TOKEN', 'token');
  vi.stubEnv('PIPELINE_TELEGRAM_ALLOWED_USER_IDS', '1,2');
  expect(readEnv()).toEqual({
    accountUrl: 'https://account.example',
    podcastUrl: 'https://podcast.example',
    telegramToken: 'token',
    allowedUserIds: '1,2',
  });
  vi.stubEnv('ACCOUNT_API_URL', '');
  expect(() => readEnv()).toThrow();
});

describe('local secrets', () => {
  it('creates a 0600 key once, reuses it, and stores MultiBaas config', async () => {
    const paths = localPaths(
      join(await mkdtemp(join(tmpdir(), 'agent-')), 'd'),
    );
    const first = await initLocal(paths);
    expect(first.created).toBe(true);
    expect((await stat(paths.key)).mode & 0o777).toBe(0o600);
    expect((await stat(paths.dir)).mode & 0o777).toBe(0o700);
    const again = await initLocal(paths, {
      url: 'https://mb.example',
      apiKey: 'secret',
    });
    expect(again).toEqual({ address: first.address, created: false });
    expect(await readMultibaasConfig(paths)).toEqual({
      url: 'https://mb.example',
      apiKey: 'secret',
    });
    expect(await readAgentKey(paths)).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it('refuses readable or malformed secrets', async () => {
    const paths = localPaths(await mkdtemp(join(tmpdir(), 'agent-')));
    await writeFile(paths.key, '0x1234\n', { mode: 0o600 });
    await expect(readAgentKey(paths)).rejects.toThrow('Malformed agent key');
    await chmod(paths.key, 0o644);
    await expect(readAgentKey(paths)).rejects.toThrow('chmod 600');
    await expect(readMultibaasConfig(paths)).rejects.toThrow();
    expect(localPaths().dir).toContain('.zap-news-agent');
    expect(await readFile(paths.key, 'utf8')).toBe('0x1234\n');
  });
});
