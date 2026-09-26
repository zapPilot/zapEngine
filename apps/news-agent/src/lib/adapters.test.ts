import { describe, expect, it, vi } from 'vitest';

import { hash, wallet } from '../test-utils/fixtures.js';
import { createHttp, type Http } from './http.js';
import { createLaya } from './laya.js';
import { createMultibaas } from './multibaas.js';
import { createPodcast } from './podcast.js';
import { createTelegram } from './telegram.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe('HTTP boundary', () => {
  it('bounds timeouts, rejects redirects and only surfaces a short message', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json({ a: 1 }));
    const http = createHttp(fetcher);
    expect(await http.getJson('https://example.com')).toEqual({ a: 1 });
    await http.postJson('https://example.com', { a: 1 }, {}, 1_000_000);
    expect(fetcher).toHaveBeenLastCalledWith(
      'https://example.com',
      expect.objectContaining({
        method: 'POST',
        body: '{"a":1}',
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
    fetcher.mockResolvedValue(json({ message: 'insufficient funds' }, 400));
    await expect(http.getJson('https://example.com')).rejects.toThrow(
      'HTTP 400: insufficient funds',
    );
    fetcher.mockResolvedValue(new Response('secret body', { status: 503 }));
    await expect(http.getJson('https://example.com')).rejects.toThrow(
      /^HTTP 503$/,
    );
    fetcher.mockResolvedValue(json({ detail: 'x' }, 500));
    await expect(http.getJson('https://example.com')).rejects.toThrow(
      /^HTTP 500$/,
    );
  });
});

function fakeHttp(result: unknown) {
  return {
    getJson: vi.fn().mockResolvedValue({ status: 200, result }),
    postJson: vi.fn().mockResolvedValue({ status: 200, result }),
  } satisfies Http;
}

describe('MultiBaas adapter', () => {
  const composed = {
    kind: 'TransactionToSignResponse',
    submitted: false,
    tx: {
      from: wallet,
      to: wallet,
      value: '0',
      data: '0x1234',
      gas: 50_000,
      nonce: 3,
      gasFeeCap: '10',
      gasTipCap: '1',
      type: 2,
    },
  };
  it('composes unsigned transactions and parses view calls', async () => {
    const http = fakeHttp(composed);
    const api = createMultibaas(http, 'https://mb.example/api/v0/', 'key');
    expect(
      await api.compose('usdc', 'usdctoken', 'approve', ['1'], wallet),
    ).toMatchObject({ nonce: 3, type: 2 });
    expect(http.postJson).toHaveBeenCalledWith(
      'https://mb.example/api/v0/chains/ethereum/addresses/usdc/contracts/usdctoken/methods/approve',
      { args: ['1'], from: wallet },
      { Authorization: 'Bearer key' },
    );
    http.postJson.mockResolvedValue({
      status: 200,
      result: { kind: 'MethodCallResponse', output: '49154985' },
    });
    expect(await api.call('usdc', 'usdctoken', 'balanceOf', [wallet])).toBe(
      49_154_985n,
    );
    http.postJson.mockResolvedValue({
      status: 200,
      result: { ...composed, submitted: true },
    });
    await expect(
      api.compose('usdc', 'usdctoken', 'approve', [], wallet),
    ).rejects.toThrow();
    http.postJson.mockResolvedValue({ status: 400, result: null });
    await expect(api.submitSigned('0xabc')).rejects.toThrow();
  });
  it('treats 404 as not-yet-available and propagates other failures', async () => {
    const http = fakeHttp({
      data: { status: '0x1', blockNumber: '0x10' },
      events: [
        {
          name: 'Deposit',
          signature: 'Deposit(address,address,uint256,uint256)',
          inputs: [{ name: 'assets', value: '1000000' }],
          contract: { address: wallet, label: 'sparkusdcvault' },
        },
      ],
    });
    const api = createMultibaas(http, 'https://mb.example', 'key');
    expect((await api.receipt(hash))?.events?.[0]?.name).toBe('Deposit');
    for (const [call, error] of [
      [() => api.receipt(hash), 'HTTP 404'],
      [() => api.address('usdc'), 'HTTP 404'],
    ] as const) {
      http.getJson.mockRejectedValueOnce(new Error(error));
      expect(await call()).toBeNull();
    }
    http.getJson.mockRejectedValue(new Error('HTTP 500'));
    await expect(api.receipt(hash)).rejects.toThrow('HTTP 500');
    await expect(api.address('usdc')).rejects.toThrow('HTTP 500');
  });
  it('queries status, events, registrations and transactions', async () => {
    const http = fakeHttp([]);
    const api = createMultibaas(http, 'https://mb.example', 'key');
    await api.events({
      tx_hash: hash,
      contract_label: 'sparkusdcvault',
      event_signature: 'Deposit(address,address,uint256,uint256)',
    });
    expect(http.getJson).toHaveBeenLastCalledWith(
      `https://mb.example/api/v0/events?tx_hash=${hash}&contract_label=sparkusdcvault&event_signature=Deposit%28address%2Caddress%2Cuint256%2Cuint256%29`,
      { Authorization: 'Bearer key' },
    );
    expect(await api.contracts()).toEqual([]);
    await api.createContract({
      label: 'x',
      contractName: 'X',
      version: '1.0',
      bin: '',
      rawAbi: '[]',
    });
    await api.createAddress('x', wallet);
    await api.linkContract('x', {
      label: 'x',
      version: '1.0',
      startingBlock: '1',
    });
    expect(http.postJson).toHaveBeenCalledTimes(3);
    http.getJson.mockResolvedValue({
      status: 200,
      result: { chainID: 8453, blockNumber: 7 },
    });
    expect(await api.status()).toEqual({ chainID: 8453, blockNumber: 7 });
    http.getJson.mockResolvedValue({
      status: 200,
      result: {
        from: wallet,
        isPending: false,
        data: { to: wallet, input: '0x' },
      },
    });
    expect((await api.transaction(hash)).from).toBe(wallet);
    http.getJson.mockResolvedValue({
      status: 200,
      result: { chainID: 1, blockNumber: 7 },
    });
    await expect(api.status()).rejects.toThrow();
  });
});

describe('Laya, podcast and Telegram adapters', () => {
  it('reads Laya probabilities and truncates long scripts', async () => {
    const http = fakeHttp(null);
    http.postJson.mockResolvedValue({
      model: 'laya-rl-agent',
      answers: {
        exchange_hack: { noul: 0.94 },
        eth_pressure: {
          choice: 'upward',
          probabilities: { upward: 0.8, downward: 0.1, none: 0.1 },
        },
      },
    });
    const ask = createLaya(http, 'http://127.0.0.1:8000/');
    expect(await ask('t', 'x'.repeat(10_000))).toEqual({
      model: 'laya-rl-agent',
      exchangeHack: 0.94,
      pressure: 'upward',
      pressureProbabilities: { upward: 0.8, downward: 0.1, none: 0.1 },
    });
    const [url, body] = http.postJson.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:8000/v1/systemone');
    expect(body.state.body).toHaveLength(6000);
    http.postJson.mockResolvedValue({
      answers: {
        exchange_hack: { noul: 0.1 },
        eth_pressure: { choice: 'none', probabilities: {} },
      },
    });
    expect((await ask('t', 'b')).model).toBe('laya');
    http.postJson.mockResolvedValue({ answers: {} });
    await expect(ask('t', 'b')).rejects.toThrow();
  });
  it('fetches the English episode and builds the smart link', async () => {
    const http = fakeHttp(null);
    const id = '11111111-1111-4111-8111-111111111111';
    http.getJson.mockResolvedValue({ id, title: 'Bitget', script: 's', x: 1 });
    const podcast = createPodcast(http, 'https://podcast.example/');
    expect(await podcast.episode(id)).toEqual({
      id,
      title: 'Bitget',
      script: 's',
    });
    expect(http.getJson).toHaveBeenCalledWith(
      `https://podcast.example/episodes/${id}?language=en`,
    );
    expect(podcast.smartLink(id)).toBe(
      `https://podcast.example/e/${id}?lang=en`,
    );
  });
  it('sends Telegram with a large link preview', async () => {
    const http = fakeHttp(null);
    http.postJson.mockResolvedValue({ ok: true });
    await createTelegram(http, 'token')('42', 'hi', 'https://x.example');
    expect(http.postJson).toHaveBeenCalledWith(
      'https://api.telegram.org/bottoken/sendMessage',
      {
        chat_id: '42',
        text: 'hi',
        link_preview_options: {
          url: 'https://x.example',
          prefer_large_media: true,
        },
      },
    );
    http.postJson.mockResolvedValue({ ok: false });
    await expect(
      createTelegram(http, 'token')('42', 'hi', 'https://x.example'),
    ).rejects.toThrow();
  });
});
