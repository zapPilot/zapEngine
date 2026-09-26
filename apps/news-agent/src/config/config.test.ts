import { afterEach, expect, it, vi } from 'vitest';

import { wallet } from '../test-utils/fixtures.js';
import { argumentsFor } from './arguments.js';
import { readEnv } from './env.js';
afterEach(() => vi.unstubAllEnvs());
it('accepts pnpm separators and rejects ambiguous execution inputs', () => {
  expect(
    argumentsFor(['--', 'run', '--', '--execute', '--arm', 'demo', '--once'])
      .values.execute,
  ).toBe(true);
  expect(argumentsFor(['report']).limit).toBe(20);
  expect(
    argumentsFor([
      'evaluate',
      '--episode',
      '11111111-1111-4111-8111-111111111111',
      '--wallet',
      wallet,
    ]).command,
  ).toBe('evaluate');
  expect(
    argumentsFor(['run', '--since', '2026-09-26T00:00:00Z']).values.since,
  ).toBeTruthy();
  for (const argv of [
    ['run', '--execute'],
    ['smoke', '--execute', '--arm', 'demo'],
    ['evaluate'],
    ['run', 'extra'],
    ['run', '--since', 'bad'],
    ['report', '--limit', '0'],
    ['run', '--arm', 'invalid/arm'],
    ['run', '--wallet', 'bad'],
  ])
    expect(() => argumentsFor(argv)).toThrow();
});
it('parses only the configured database schema and supplies safe defaults', () => {
  const values = {
    SUPABASE_URL: 'https://db.example',
    SUPABASE_SERVICE_ROLE_KEY: 'key',
    ACCOUNT_API_URL: 'https://account.example',
    PODCAST_API_URL: 'https://podcast.example',
    RPC_URL_BASE: 'https://rpc.example',
    LLM_MODEL: 'model',
    OPENROUTER_API_KEY: 'key',
  };
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
  for (const key of [
    'SUPABASE_DB_SCHEMA',
    'OPENROUTER_BASE_URL',
    'MULTIBAAS_BASE_URL',
    'MULTIBAAS_API_KEY',
    'PIPELINE_TELEGRAM_BOT_TOKEN',
    'PIPELINE_TELEGRAM_ALLOWED_USER_IDS',
  ])
    vi.stubEnv(key, undefined);
  expect(readEnv()).toMatchObject({
    dbSchema: 'from_fed_to_chain',
    openrouterUrl: 'https://openrouter.ai/api/v1',
    allowedUserIds: '',
  });
  vi.stubEnv('SUPABASE_DB_SCHEMA', 'public');
  expect(() => readEnv()).toThrow();
});
