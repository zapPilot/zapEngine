import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getOpenRouterModelCandidates,
  getTranslationFallbackModels,
  parseOpenRouterModelList,
} from './llm-model-fallback.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('LLM model fallback config', () => {
  it('parses ordered comma-separated models without duplicates', () => {
    expect(
      parseOpenRouterModelList(
        ' first/model, second/model, first/model, ,third/model ',
      ),
    ).toEqual(['first/model', 'second/model', 'third/model']);
  });

  it('uses only the primary model when fallback config is absent', () => {
    vi.stubEnv('LLM_FALLBACK_MODELS', '');

    expect(getOpenRouterModelCandidates('primary/model')).toEqual([
      'primary/model',
    ]);
  });

  it('reads the general fallback order from env', () => {
    vi.stubEnv(
      'LLM_FALLBACK_MODELS',
      'fallback/one,fallback/two,primary/model',
    );

    expect(getOpenRouterModelCandidates('primary/model')).toEqual([
      'primary/model',
      'fallback/one',
      'fallback/two',
    ]);
  });

  it('keeps translation paid fallbacks independently configurable', () => {
    vi.stubEnv('TRANSLATION_FALLBACK_MODELS', 'paid/one,paid/two,paid/one');

    expect(getTranslationFallbackModels()).toEqual(['paid/one', 'paid/two']);
  });
});
