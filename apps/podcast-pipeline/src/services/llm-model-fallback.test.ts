import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getOpenRouterModelCandidates,
  OPENROUTER_FREE_MODEL,
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

  it('appends the one shared fallback order and deduplicates the primary', () => {
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

  it('uses the same fallback list for the free-router primary', () => {
    vi.stubEnv('LLM_FALLBACK_MODELS', 'fallback/one,fallback/two');

    expect(OPENROUTER_FREE_MODEL).toBe('openrouter/free');
    expect(getOpenRouterModelCandidates(OPENROUTER_FREE_MODEL)).toEqual([
      'openrouter/free',
      'fallback/one',
      'fallback/two',
    ]);
  });
});
