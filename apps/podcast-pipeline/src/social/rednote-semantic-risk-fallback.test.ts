import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const llmMocks = vi.hoisted(() => ({
  createOpenRouterChatCompletion: vi.fn(),
  getOpenRouterConfig: vi.fn(),
  openai: {},
}));

vi.mock('../services/llm.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/llm.js')>()),
  createOpenRouterChatCompletion: llmMocks.createOpenRouterChatCompletion,
  getOpenRouterConfig: llmMocks.getOpenRouterConfig,
}));

import {
  assertRednoteSemanticRisk,
  RednoteSemanticRiskError,
} from './rednote-semantic-risk.js';

const FALLBACKS = [
  'minimax/minimax-m3:free',
  'z-ai/glm-5.3-flash',
  'deepseek/deepseek-v4-flash',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
];
const PRIMARY = 'deepseek/deepseek-v4-flash-0731';
const INPUT = {
  rednote: {
    title: 'AI公司反而更需要人',
    body: '一家不到40人的公司把AI用進財務、法務與HR，但最後更重視人與人的信任。',
    hashtags: ['AI', '科技趨勢', '職場'],
  },
  episode: {
    title: 'AI滲透率接近100%的公司',
    summary: '討論AI導入後的組織變化。',
    transcript: 'AI把能加速的事情加速，留下來更重要的是人與人的信任。',
  },
};

function completion(content: string): object {
  return { choices: [{ message: { content } }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('LLM_FALLBACK_MODELS', FALLBACKS.join(','));
  llmMocks.getOpenRouterConfig.mockImplementation(
    (overrides?: { model?: string; thinkingModel?: string | null }) => ({
      openai: llmMocks.openai,
      model: overrides?.model ?? PRIMARY,
      thinkingModel: overrides?.thinkingModel ?? null,
      timeoutMs: 120_000,
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Rednote semantic-risk model fallback', () => {
  it('moves to the next model on empty and malformed outputs', async () => {
    llmMocks.createOpenRouterChatCompletion
      .mockResolvedValueOnce(completion('   '))
      .mockResolvedValueOnce(completion('not json'))
      .mockResolvedValueOnce(completion('{"risks":[]}'));

    await expect(assertRednoteSemanticRisk(INPUT)).resolves.toBeUndefined();

    expect(llmMocks.createOpenRouterChatCompletion).toHaveBeenCalledTimes(3);
    expect(
      llmMocks.createOpenRouterChatCompletion.mock.calls.map(
        (call) => call[1]?.model,
      ),
    ).toEqual([PRIMARY, FALLBACKS[0], FALLBACKS[1]]);
    expect(llmMocks.createOpenRouterChatCompletion.mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({
        reasoning: { enabled: false },
        logContext: { prefix: '[rednote-risk]' },
      }),
    );
  });

  it('keeps a real risk verdict authoritative instead of shopping for a pass', async () => {
    llmMocks.createOpenRouterChatCompletion
      .mockResolvedValueOnce(completion(''))
      .mockResolvedValueOnce(
        completion(
          JSON.stringify({
            risks: [
              {
                rule: 'market_timing_advice',
                evidence: '現在就該退場',
                reason: 'Tells the reader when to exit.',
              },
            ],
          }),
        ),
      );

    const error = await assertRednoteSemanticRisk(INPUT).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(RednoteSemanticRiskError);
    expect(error).toMatchObject({
      reason: 'risk',
      rules: ['market_timing_advice'],
    });
    expect(llmMocks.createOpenRouterChatCompletion).toHaveBeenCalledTimes(2);
  });

  it('still fails closed after every configured model fails the output contract', async () => {
    llmMocks.createOpenRouterChatCompletion.mockResolvedValue(
      completion('{"wrong":true}'),
    );

    await expect(assertRednoteSemanticRisk(INPUT)).rejects.toMatchObject({
      reason: 'unavailable',
      rules: [],
    });
    expect(llmMocks.createOpenRouterChatCompletion).toHaveBeenCalledTimes(
      1 + FALLBACKS.length,
    );

    const finalRequest =
      llmMocks.createOpenRouterChatCompletion.mock.calls.at(-1)?.[1];
    expect(finalRequest?.model).toBe(FALLBACKS.at(-1));
    expect(finalRequest).not.toHaveProperty('response_format');
  });
});
