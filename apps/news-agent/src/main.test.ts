import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('./config/env.js', () => ({ readEnv: vi.fn() }));
vi.mock('./lib/chain.js', () => ({ createChain: vi.fn() }));
vi.mock('./lib/http.js', () => ({ createHttp: vi.fn() }));
vi.mock('./lib/multibaas.js', () => ({ createMultibaas: vi.fn() }));
vi.mock('./lib/openrouter.js', () => ({ createRecognizer: vi.fn() }));
vi.mock('./lib/supabase.js', () => ({ createStore: vi.fn() }));
vi.mock('./services/daemon.js', () => ({ daemon: vi.fn() }));
vi.mock('./services/smoke.js', () => ({ smoke: vi.fn() }));
import { readEnv } from './config/env.js';
import { createChain } from './lib/chain.js';
import { createHttp } from './lib/http.js';
import { createMultibaas } from './lib/multibaas.js';
import { createRecognizer } from './lib/openrouter.js';
import { createStore } from './lib/supabase.js';
import { main } from './main.js';
import { daemon } from './services/daemon.js';
import { smoke } from './services/smoke.js';
import {
  action,
  approvedReview,
  memoryStore,
  now,
  wallet,
} from './test-utils/fixtures.js';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(Date, 'now').mockReturnValue(now);
  vi.mocked(readEnv).mockReturnValue({
    supabaseUrl: 'https://db.example',
    supabaseKey: 'key',
    dbSchema: 'from_fed_to_chain',
    accountUrl: 'https://account.example',
    podcastUrl: 'https://podcast.example',
    rpcUrl: 'https://rpc.example',
    model: 'model',
    openrouterKey: 'key',
    openrouterUrl: 'https://llm.example',
    multibaasUrl: 'https://mb.example',
    multibaasKey: 'key',
    allowedUserIds: '',
  });
  vi.mocked(createStore).mockReturnValue(memoryStore().store);
  vi.mocked(createChain).mockReturnValue({
    assertChain: vi.fn(),
    nonce: vi.fn(),
    prepare: vi.fn(),
    receipt: vi.fn(),
  });
  vi.mocked(createHttp).mockReturnValue({
    getJson: vi.fn(),
    postJson: vi.fn().mockResolvedValue(approvedReview()),
  });
  vi.mocked(createMultibaas).mockReturnValue({
    chainStatus: vi.fn(),
    listHsmWallets: vi.fn().mockResolvedValue(wallet),
    submit: vi.fn(),
    txmByNonce: vi.fn(),
  });
  vi.mocked(createRecognizer).mockReturnValue(
    vi.fn().mockResolvedValue({ matches: true, evidence: 'quote' }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it('report only reads persistent actions without initializing a signer', async () => {
  await main(['report', '--limit', '5']);
  expect(createMultibaas).not.toHaveBeenCalled();
  expect(createStore('url', 'key').list).toHaveBeenCalledWith(
    expect.any(Array),
    undefined,
    5,
  );
});
it('evaluate with an explicit wallet needs no MultiBaas and writes no action', async () => {
  await main([
    'evaluate',
    '--episode',
    action().episode_id,
    '--wallet',
    wallet,
  ]);
  expect(createMultibaas).not.toHaveBeenCalled();
  expect(createStore('url', 'key').cas).not.toHaveBeenCalled();
  expect(console.log).toHaveBeenCalledWith(
    expect.stringContaining('"allowed": true'),
  );
});
it('evaluate skips keyword-free LLM calls while still obtaining a review', async () => {
  vi.mocked(createStore('url', 'key').episode).mockResolvedValue({
    id: 'id',
    title: 'other',
    raw_text: 'article',
    source_url: 'url',
  });
  await main(['evaluate', '--episode', action().episode_id]);
  expect(
    createRecognizer(createHttp(), 'url', 'key', 'model'),
  ).not.toHaveBeenCalled();
});
it('run validates both chains and one wallet before passing control to daemon', async () => {
  await main(['run', '--once']);
  expect(daemon).toHaveBeenCalled();
  const input = vi.mocked(daemon).mock.calls[0]![0];
  expect(await input.review()).toEqual(approvedReview());
  expect(input.http.postJson).toHaveBeenCalledWith(
    'https://account.example/plan-orchestration/deposit/review',
    expect.objectContaining({ userAddress: wallet, fromAmount: '1000000' }),
    {},
    90000,
  );
});
it('dispatches explicit smoke and rejects missing signing credentials', async () => {
  await main(['smoke']);
  expect(smoke).toHaveBeenCalled();
  await vi.mocked(smoke).mock.calls[0]![3](0);
  const env = readEnv();
  delete env.multibaasKey;
  vi.mocked(readEnv).mockReturnValue(env);
  await expect(main(['run', '--once'])).rejects.toThrow();
});
