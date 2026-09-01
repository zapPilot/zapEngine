import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const riskMocks = vi.hoisted(() => ({ assertRednoteSemanticRisk: vi.fn() }));

vi.mock('./rednote-semantic-risk.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./rednote-semantic-risk.js')>()),
  assertRednoteSemanticRisk: riskMocks.assertRednoteSemanticRisk,
}));

import { generateSocialCopy } from './copy.js';
import { RednoteSemanticRiskError } from './rednote-semantic-risk.js';

beforeEach(() => {
  vi.clearAllMocks();
  llmMocks.getOpenRouterConfig.mockReturnValue({
    openai: llmMocks.openai,
    model: 'deepseek/deepseek-v4-flash-0731',
    thinkingModel: null,
    timeoutMs: 120_000,
  });
  llmMocks.createOpenRouterChatCompletion.mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            topic: 'technology',
            rednote: {
              hookType: 'explainer',
              title: 'AI公司為何更重視人',
              body: '一家不到40人的公司大量導入AI後，真正留下來的重要能力反而是人與人的信任。',
              hashtags: ['人工智慧', '科技趨勢', '職場'],
            },
          }),
        },
      },
    ],
  });
  riskMocks.assertRednoteSemanticRisk.mockRejectedValue(
    new RednoteSemanticRiskError({
      reason: 'unavailable',
      message:
        'Rednote semantic risk gate could not reach a verdict — all model candidates failed. The copy is not published ungated.',
    }),
  );
});

describe('generateSocialCopy when the Rednote judge is unavailable', () => {
  it('preserves fail-closed behavior without regenerating the copy', async () => {
    await expect(
      generateSocialCopy({
        platforms: ['rednote'],
        episode: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'AI滲透率接近100%的公司',
          summary: '討論AI導入後的組織變化。',
          transcript: 'AI把能加速的事情加速，留下來更重要的是人與人的信任。',
          publishedAt: '2026-08-12T00:00:00.000Z',
          episodeUrl: 'https://example.com/e/episode',
          videoDurationSeconds: 180,
          languageCode: 'zh-Hant',
          videoUrl: 'https://example.com/video.mp4',
        },
      }),
    ).rejects.toMatchObject({ reason: 'unavailable' });

    expect(llmMocks.createOpenRouterChatCompletion).toHaveBeenCalledTimes(1);
    expect(riskMocks.assertRednoteSemanticRisk).toHaveBeenCalledTimes(1);
  });
});
