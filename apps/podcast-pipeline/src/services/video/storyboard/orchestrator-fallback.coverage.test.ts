import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDeterministicStoryboard: vi.fn(),
  validateStoryboardDraft: vi.fn(),
}));

vi.mock('./fallback.js', () => ({
  createDeterministicStoryboard: mocks.createDeterministicStoryboard,
}));

vi.mock('./validation.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./validation.js')>()),
  validateStoryboardDraft: mocks.validateStoryboardDraft,
}));

import { generateStoryboard } from './orchestrator.js';

describe('storyboard orchestrator fail-closed fallback coverage', () => {
  it('throws the deterministic validation issues when both provider attempts fail and fallback is invalid', async () => {
    mocks.createDeterministicStoryboard.mockReturnValue({ scenes: [] });
    mocks.validateStoryboardDraft.mockReturnValue({
      success: false,
      draft: null,
      issues: [
        {
          code: 'sentences.coverage',
          path: ['scenes'],
          message: 'fallback missed the script',
        },
        {
          code: 'scenes.count',
          path: ['scenes'],
          message: 'fallback scene count invalid',
        },
      ],
    });
    const provider = {
      name: 'broken-provider',
      model: 'broken-model',
      generate: vi.fn().mockRejectedValue(new Error('provider unavailable')),
    };

    await expect(
      generateStoryboard({
        title: 'Title',
        script: 'One sentence.',
        durationMs: 5_000,
        provider,
        sentences: [
          {
            id: 's0001',
            index: 0,
            text: 'One sentence.',
            startOffset: 0,
            endOffset: 13,
          },
        ],
      }),
    ).rejects.toThrow(
      'Deterministic storyboard failed validation: fallback missed the script; fallback scene count invalid',
    );

    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(mocks.createDeterministicStoryboard).toHaveBeenCalledOnce();
  });
});
