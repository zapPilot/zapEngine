import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  generateEditorialTitleWithLLM,
  normalizeEditorialTitle,
} from './editorial-title.js';

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  config: vi.fn(),
  log: vi.fn(),
}));
vi.mock('./llm.js', () => ({
  getOpenRouterConfig: mocks.config,
  createCompletionWithRetry: mocks.complete,
  completionMetadata: (completion: {
    model: string;
    provider: string;
    usage: { cost: number };
  }) => ({
    model: completion.model,
    provider: completion.provider,
    costUsd: completion.usage.cost,
  }),
}));
vi.mock('./ingest/step.js', () => ({ logIngestEvent: mocks.log }));
const completion = (content: unknown, finish_reason = 'stop', cost = 0.01) => ({
  choices: [{ message: { content }, finish_reason }],
  model: 'resolved/model',
  provider: 'provider',
  usage: { cost },
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.config.mockReturnValue({ openai: 'client', model: 'test/model' });
});
describe('normalizeEditorialTitle', () => {
  it('trims wrapping quotes without changing Chinese character forms', () => {
    expect(normalizeEditorialTitle('  ‘「软件市场进入新阶段」’  ')).toBe(
      '软件市场进入新阶段',
    );
  });

  it.each([
    '',
    '太短',
    '# 這是 Markdown 標題',
    '**這是粗體標題**',
    '__這是粗體標題__',
    '第一行\n第二行',
    '標'.repeat(61),
    null,
  ])('rejects the invalid editorial title %j', (value) => {
    expect(normalizeEditorialTitle(value)).toBeNull();
  });
});

describe('generateEditorialTitleWithLLM', () => {
  it('sends only the source title with cheap plain text settings', async () => {
    mocks.complete.mockResolvedValue(completion('市场流动性重新定价'));
    await expect(generateEditorialTitleWithLLM('來源標題')).resolves.toEqual({
      title: '市场流动性重新定价',
      model: 'resolved/model',
      provider: 'provider',
      costUsd: 0.01,
    });
    expect(mocks.config).toHaveBeenCalledWith({ thinkingModel: null });
    const [client, request, thinking, operation, options] =
      mocks.complete.mock.calls[0]!;
    expect(client).toBe('client');
    expect(request).toMatchObject({
      temperature: 0.3,
      max_tokens: 200,
      messages: [
        expect.objectContaining({ role: 'system' }),
        { role: 'user', content: '來源標題' },
      ],
    });
    expect(request).not.toHaveProperty('response_format');
    expect(thinking).toBeNull();
    expect(operation).toBe('generateEditorialTitle');
    expect(options).toEqual({ reasoning: { enabled: false } });
    expect(mocks.complete).toHaveBeenCalledTimes(1);
  });
  it.each(['标题： “市场流动性重新定价”', '標題：市场流动性重新定价'])(
    'strips a title label and quotes: %s',
    async (content) => {
      mocks.complete.mockResolvedValue(completion(content));
      expect((await generateEditorialTitleWithLLM('Source')).title).toBe(
        '市场流动性重新定价',
      );
    },
  );
  it.each(['标题：市场流动性重新定价', '標'.repeat(22)])(
    'retries a long title and accepts a second valid title: %s',
    async (second) => {
      mocks.complete
        .mockResolvedValueOnce(completion('標'.repeat(26)))
        .mockResolvedValueOnce(completion(second, 'stop', 0.02));
      const result = await generateEditorialTitleWithLLM('Source');
      expect(result.title).toBe(normalizeEditorialTitle(second));
      expect(result.costUsd).toBeCloseTo(0.03);
      expect(mocks.complete.mock.calls[1]![1].messages[1].content).toContain(
        '上一个标题 26 个字，超过 20 字',
      );
    },
  );
  it('keeps the first valid long title when the correction is invalid', async () => {
    mocks.complete
      .mockResolvedValueOnce(completion('標'.repeat(21)))
      .mockResolvedValueOnce(completion('# invalid'));
    expect((await generateEditorialTitleWithLLM('Source')).title).toBe(
      '標'.repeat(21),
    );
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it.each(['length', 'stop'])(
    'fails open after two invalid responses (%s)',
    async (finish) => {
      mocks.complete.mockResolvedValue(
        completion(finish === 'length' ? '合法標題文字' : '**bad**', finish),
      );
      await expect(
        generateEditorialTitleWithLLM('Source'),
      ).resolves.toMatchObject({ title: null, costUsd: 0.02 });
      expect(mocks.log).toHaveBeenCalledWith('llm:title-fallback', {
        reason: finish === 'length' ? 'truncated' : 'invalid_title',
      });
    },
  );
  it('accepts a correction after an invalid first title', async () => {
    mocks.complete
      .mockResolvedValueOnce(completion(null))
      .mockResolvedValueOnce(completion('市场流动性重新定价'));
    expect((await generateEditorialTitleWithLLM('Source')).title).toBe(
      '市场流动性重新定价',
    );
  });
  it('fails open on transport errors and retains already billed cost', async () => {
    mocks.complete
      .mockResolvedValueOnce(completion('標'.repeat(21)))
      .mockRejectedValueOnce(new Error('offline'));
    await expect(generateEditorialTitleWithLLM('Source')).resolves.toEqual({
      title: null,
      costUsd: 0.01,
      model: 'resolved/model',
      provider: 'provider',
    });
    expect(mocks.log).toHaveBeenCalledWith('llm:title-fallback', {
      reason: 'transport: offline',
    });
  });
  it('fails open when configuration is unavailable', async () => {
    mocks.config.mockImplementation(() => {
      throw new Error('missing config');
    });
    await expect(generateEditorialTitleWithLLM('Source')).resolves.toEqual({
      title: null,
      costUsd: 0,
      model: 'unknown',
      provider: 'unknown',
    });
  });
});
