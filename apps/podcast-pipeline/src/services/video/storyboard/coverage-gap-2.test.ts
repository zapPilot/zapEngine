import { describe, expect, it, vi } from 'vitest';

import { splitCanonicalSentences } from './sentences.js';
import { generateStoryboard } from './orchestrator.js';
import type {
  StoryboardProvider,
  StoryboardProviderRequest,
} from './provider.js';

const script = [
  '今天先看市場流動性的變化。',
  '第一個訊號來自美元資金成本。',
  '接著觀察國債市場的期限溢價。',
  '投資人也重新評估風險資產。',
  '鏈上交易量同步出現回升。',
  '穩定幣供給提供另一個線索。',
  '交易所的深度仍需要持續追蹤。',
  '短期波動不代表趨勢已經反轉。',
  '風險管理仍然是最重要的原則。',
  '最後請留意下一次政策會議。',
].join('');

describe('storyboard orchestration error paths', () => {
  it('records provider throws as issues and falls back', async () => {
    const provider: StoryboardProvider = {
      name: 'fixture-throws',
      model: 'fixture-v1',
      generate: vi.fn(async () => {
        throw new Error('LLM overloaded');
      }),
    };

    const result = await generateStoryboard({
      title: '市場流動性觀察',
      script,
      durationMs: 90_000,
      provider,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]?.error).toContain('LLM overloaded');
    expect(result.attempts[0]?.issues[0]?.code).toBe('provider.response');
    expect(result.attempts[0]?.usage).toBeNull();
    expect(result.totalUsage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
  });

  it('recovers on the second attempt after a throw', async () => {
    const seen: StoryboardProviderRequest[] = [];
    const provider: StoryboardProvider = {
      name: 'fixture-flaky',
      model: 'fixture-v1',
      generate: vi.fn(async (request: StoryboardProviderRequest) => {
        seen.push(request);
        if (seen.length === 1) throw new Error('transient outage');
        const { createDeterministicStoryboard } = await import('./fallback.js');
        const sentences = splitCanonicalSentences(script);
        return {
          draft: createDeterministicStoryboard({
            title: '市場流動性觀察',
            script,
            durationMs: 90_000,
            sentences,
          }),
          model: 'fixture-v1',
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        };
      }),
    };

    const result = await generateStoryboard({
      title: '市場流動性觀察',
      script,
      durationMs: 90_000,
      provider,
    });

    expect(result.usedFallback).toBe(false);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]?.valid).toBe(false);
    expect(result.attempts[1]?.valid).toBe(true);
    expect(result.totalUsage).toEqual({
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
    });
  });

  it('uses the editorial scene range when packaged', async () => {
    const provider: StoryboardProvider = {
      name: 'fixture-packaged',
      model: 'fixture-v1',
      generate: vi.fn(async () => {
        throw new Error('packaged outage');
      }),
    };
    const sentences = splitCanonicalSentences(script);

    const result = await generateStoryboard({
      title: '市場流動性觀察',
      script,
      durationMs: 90_000,
      provider,
      sentences,
      isPackaged: true,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.attempts).toHaveLength(2);
  });
});
