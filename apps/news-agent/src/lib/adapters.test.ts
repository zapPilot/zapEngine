import { afterEach, describe, expect, it, vi } from 'vitest';

import { hash, payload, txm, wallet } from '../test-utils/fixtures.js';
import { createHttp } from './http.js';
import { createMultibaas } from './multibaas.js';
import { createRecognizer } from './openrouter.js';
import { createTelegram } from './telegram.js';

afterEach(() => vi.restoreAllMocks());
describe('HTTP boundary', () => {
  it('uses bounded timeouts, rejects redirects and does not disclose error bodies', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response('{"answer":1}', { status: 200 }),
      );
    const http = createHttp(fetcher);
    expect(await http.getJson('https://example.com')).toEqual({ answer: 1 });
    await http.postJson(
      'https://example.com',
      { a: 1 },
      { Authorization: 'Bearer test' },
      1_000_000,
    );
    expect(fetcher).toHaveBeenLastCalledWith(
      'https://example.com',
      expect.objectContaining({
        method: 'POST',
        body: '{"a":1}',
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
    fetcher.mockResolvedValue(
      new Response('secret upstream data', { status: 503 }),
    );
    await expect(http.getJson('https://example.com')).rejects.toThrow(
      'HTTP 503',
    );
  });
  it('propagates timeout and malformed JSON failures', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('timeout'));
    await expect(createHttp(fetcher).postJson('url', {})).rejects.toThrow(
      'timeout',
    );
    fetcher.mockResolvedValue(new Response('bad json'));
    await expect(createHttp(fetcher).getJson('url')).rejects.toThrow();
  });
});
describe('MultiBaas adapter uses real SDK envelopes', () => {
  function setup(result: unknown) {
    const http = {
      getJson: vi.fn().mockResolvedValue({ status: 200, result }),
      postJson: vi.fn().mockResolvedValue({ status: 200, result }),
    };
    return {
      http,
      api: createMultibaas(http, 'https://multibaas.example/api/v0/', 'key'),
    };
  }
  it('requires Base and exactly one publicAddress wallet', async () => {
    const { http, api } = setup({ chainID: 8453 });
    await api.chainStatus();
    http.getJson.mockResolvedValue({
      status: 200,
      result: [{ publicAddress: wallet }],
    });
    expect(await api.listHsmWallets()).toBe(wallet);
    expect(http.getJson).toHaveBeenLastCalledWith(
      'https://multibaas.example/api/v0/hsm/wallets',
      { Authorization: 'Bearer key' },
    );
    for (const result of [
      [],
      [{ publicAddress: wallet }, { publicAddress: wallet }],
      [{ publicAddress: 'bad' }],
    ]) {
      http.getJson.mockResolvedValue({ status: 200, result });
      await expect(api.listHsmWallets()).rejects.toThrow();
    }
    http.getJson.mockResolvedValue({ status: 200, result: { chainID: 1 } });
    await expect(api.chainStatus()).rejects.toThrow();
  });
  it('submits exact EIP-1559 payload and validates nonce-filtered records', async () => {
    const { http, api } = setup({ tx: { hash } });
    expect(await api.submit(payload())).toBe(hash);
    expect(http.postJson).toHaveBeenCalledWith(
      'https://multibaas.example/api/v0/chains/ethereum/hsm/submit',
      { tx: payload() },
      { Authorization: 'Bearer key' },
    );
    http.getJson.mockResolvedValue({ status: 200, result: [txm()] });
    expect(await api.txmByNonce(wallet, 7)).toEqual([txm()]);
    expect(http.getJson).toHaveBeenLastCalledWith(
      expect.stringContaining(`txm/${wallet}?nonce=7`),
      expect.any(Object),
    );
    http.getJson.mockResolvedValue({ status: 500, result: [] });
    await expect(api.txmByNonce(wallet, 7)).rejects.toThrow();
  });
});
describe('recognition and Telegram wire contracts', () => {
  it('requests strict JSON recognition and rejects malformed LLM output', async () => {
    const http = {
      getJson: vi.fn(),
      postJson: vi.fn().mockResolvedValue({
        choices: [
          { message: { content: '{"matches":true,"evidence":"quote"}' } },
        ],
      }),
    };
    const recognize = createRecognizer(
      http,
      'https://openrouter.example/api/v1/',
      'key',
      'model',
    );
    expect(await recognize('Bitget', '繁體中文新聞')).toEqual({
      matches: true,
      evidence: 'quote',
    });
    expect(http.postJson).toHaveBeenCalledWith(
      'https://openrouter.example/api/v1/chat/completions',
      expect.objectContaining({
        response_format: { type: 'json_object' },
        reasoning: { enabled: false },
        provider: { sort: 'throughput', require_parameters: true },
      }),
      { Authorization: 'Bearer key' },
    );
    http.postJson.mockResolvedValue({
      choices: [{ message: { content: '{"matches":"yes"}' } }],
    });
    await expect(recognize('title', 'text')).rejects.toThrow();
  });
  it('sends plain text with episode preview and checks Telegram ok', async () => {
    const http = {
      getJson: vi.fn(),
      postJson: vi.fn().mockResolvedValue({ ok: true }),
    };
    const send = createTelegram(http, 'test-token');
    await send('123', '<plain text>', 'https://podcast.example/e/id');
    expect(http.postJson).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/sendMessage',
      {
        chat_id: '123',
        text: '<plain text>',
        link_preview_options: { url: 'https://podcast.example/e/id' },
      },
    );
    http.postJson.mockResolvedValue({ ok: false });
    await expect(send('123', 'text', 'url')).rejects.toThrow();
  });
});
