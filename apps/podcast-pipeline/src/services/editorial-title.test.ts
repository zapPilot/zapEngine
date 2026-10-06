import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  generateEditorialTitleWithLLM,
  isSameEditorialTitle,
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

describe('isSameEditorialTitle', () => {
  it.each([
    ['市场 流动性', '市场流动性'],
    ['「市场：流动性！」', '市场流动性'],
    ['ＡＩ２０２６市场', 'ai2026市场'],
    ['網路與軟件市場', '网路与软件市场'],
    ['AI市场', 'ai市场'],
    ['市场\t\n\u200b流动性★', '市场流动性'],
  ])('recognizes normalized equality: %s', (candidate, source) => {
    expect(isSameEditorialTitle(candidate, source)).toBe(true);
  });
  it.each([
    ['', ''],
    ['「 ！」', '★'],
    ['市场流动性', '市场流动性如何变化'],
  ])('does not equate empty or rewritten titles: %s', (candidate, source) => {
    expect(isSameEditorialTitle(candidate, source)).toBe(false);
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
  it('accepts a long rewritten Best Title on the first request', async () => {
    const title = '标题'.repeat(20);
    mocks.complete.mockResolvedValue(completion(title));
    expect((await generateEditorialTitleWithLLM('来源标题')).title).toBe(title);
    expect(mocks.complete).toHaveBeenCalledTimes(1);
  });
  it('rejects an identical title and accepts a rewritten correction', async () => {
    mocks.complete
      .mockResolvedValueOnce(completion('「ＡＩ 網路市場！」'))
      .mockResolvedValueOnce(completion('AI如何改变网路市场？'));
    const result = await generateEditorialTitleWithLLM('ai网路市场');
    expect(result).toMatchObject({
      title: 'AI如何改变网路市场？',
      costUsd: 0.02,
    });
    expect(mocks.complete.mock.calls[1]![1].messages[1].content).toContain(
      '与来源标题相同或仅有标点、空格差异，必须换切入点或句式重新改写',
    );
  });
  it('returns null and billed cost after two identical titles', async () => {
    mocks.complete.mockResolvedValue(completion('AI 網路市場！'));
    expect(await generateEditorialTitleWithLLM('ai网路市场')).toMatchObject({
      title: null,
      costUsd: 0.02,
    });
    expect(mocks.complete).toHaveBeenCalledTimes(2);
    expect(mocks.log).toHaveBeenCalledWith('llm:title-failed', {
      reason: '与来源标题相同或仅有标点、空格差异，必须换切入点或句式重新改写',
    });
  });
  it.each(['length', 'stop'])(
    'returns null after two invalid responses (%s)',
    async (finish) => {
      mocks.complete.mockResolvedValue(
        completion(finish === 'length' ? '合法標題文字' : '**bad**', finish),
      );
      await expect(
        generateEditorialTitleWithLLM('Source'),
      ).resolves.toMatchObject({ title: null, costUsd: 0.02 });
      expect(mocks.log).toHaveBeenCalledWith('llm:title-failed', {
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
  it('returns null on transport errors and retains already billed cost', async () => {
    mocks.complete
      .mockResolvedValueOnce(completion(null))
      .mockRejectedValueOnce(new Error('offline'));
    await expect(generateEditorialTitleWithLLM('Source')).resolves.toEqual({
      title: null,
      costUsd: 0.01,
      model: 'resolved/model',
      provider: 'provider',
    });
    expect(mocks.log).toHaveBeenCalledWith('llm:title-failed', {
      reason: 'transport: offline',
    });
  });
  it('returns null when configuration is unavailable', async () => {
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

describe('budget variants', () => {
  it('skips all fitting budgets without requests or cost', async () => {
    const { buildEditorialTitleVariants } =
      await import('./editorial-title.js');
    expect(
      await buildEditorialTitleVariants('短的来源标题', '来源', [20, 100]),
    ).toEqual({ titleVariants: {}, cost: [] });
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.config).not.toHaveBeenCalled();
  });
  it('compresses only exceeded unique budgets with source context and no platform', async () => {
    const { buildEditorialTitleVariants } =
      await import('./editorial-title.js');
    mocks.complete.mockResolvedValue(completion('你用USDT买到什么？'));
    const best = '你'.repeat(40);
    const result = await buildEditorialTitleVariants(
      best,
      '用USDT买美股',
      [20, 100, 20],
    );
    expect(result.titleVariants).toEqual({
      '20': { title: '你用USDT买到什么？', method: 'llm' },
    });
    expect(result.cost).toHaveLength(1);
    expect(result.cost[0]).toMatchObject({ label: 'LLM title', costUsd: 0.01 });
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    const request = mocks.complete.mock.calls[0]![1];
    expect(request.messages[1].content).toContain(best);
    expect(request.messages[1].content).toContain('用USDT买美股');
    expect(request.messages[1].content).toContain('上限 N: 20');
    expect(JSON.stringify(request)).not.toMatch(
      /rednote|youtube|threads|小红书/iu,
    );
    expect(mocks.complete.mock.calls[0]![3]).toBe('compressEditorialTitle');
  });
  it('corrects an overlong response and normalizes Traditional output', async () => {
    const { compressEditorialTitleWithLLM } =
      await import('./editorial-title.js');
    mocks.complete
      .mockResolvedValueOnce(completion('標'.repeat(21)))
      .mockResolvedValueOnce(completion('網路與軟件市場的疑問'));
    const result = await compressEditorialTitleWithLLM(
      '標'.repeat(35),
      '來源',
      20,
    );
    expect(result).toMatchObject({
      title: '网路与软件市场的疑问',
      method: 'llm',
      costUsd: 0.02,
    });
    expect(mocks.complete.mock.calls[1]![1].messages[1].content).toContain(
      '超过 20 字',
    );
  });
  it.each([
    ['too long', '標'.repeat(25), 'stop'],
    ['invalid', null, 'stop'],
    ['truncated', '合法標題文字', 'length'],
  ])('fits after two %s responses', async (_name, content, finish) => {
    const { compressEditorialTitleWithLLM } =
      await import('./editorial-title.js');
    mocks.complete.mockResolvedValue(completion(content, String(finish)));
    const result = await compressEditorialTitleWithLLM(
      '這個網路'.repeat(8),
      '來源',
      20,
    );
    expect(result.method).toBe('truncate');
    expect([...result.title].length).toBeLessThanOrEqual(20);
    expect(result.costUsd).toBe(0.02);
    expect(result.title).not.toContain('這');
  });
  it('retains billed cost when compression transport fails', async () => {
    const { compressEditorialTitleWithLLM } =
      await import('./editorial-title.js');
    mocks.complete
      .mockResolvedValueOnce(completion(null))
      .mockRejectedValueOnce(new Error('offline'));
    expect(
      await compressEditorialTitleWithLLM('標'.repeat(30), '來源', 20),
    ).toMatchObject({ method: 'truncate', costUsd: 0.01 });
  });
  it('fails open when compression config is missing', async () => {
    const { compressEditorialTitleWithLLM } =
      await import('./editorial-title.js');
    mocks.config.mockImplementation(() => {
      throw new Error('missing');
    });
    expect(
      await compressEditorialTitleWithLLM('標'.repeat(30), '來源', 20),
    ).toMatchObject({
      method: 'truncate',
      costUsd: 0,
      model: 'unknown',
      provider: 'unknown',
    });
  });
});
