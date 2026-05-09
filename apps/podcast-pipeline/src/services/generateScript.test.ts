import { describe, expect, it, vi } from 'vitest';

import { generateScript } from './generateScript.js';

vi.mock('./llm.js', () => ({
  generateScriptWithLLM: vi.fn().mockResolvedValue({
    script: 'Generated script content',
    model: 'test/model',
    thinkingModel: null,
    provider: 'TestProvider',
  }),
}));

describe('generateScript', () => {
  it('passes article title and text to LLM', async () => {
    const result = await generateScript({
      title: 'Test Title',
      text: 'Test article text',
    });

    const { generateScriptWithLLM } = await import('./llm.js');
    expect(generateScriptWithLLM).toHaveBeenCalledWith(
      'Test Title',
      'Test article text',
    );
    expect(result.script).toBe('Generated script content');
    expect(result.model).toBe('test/model');
  });

  it('returns full LLM result', async () => {
    const result = await generateScript({ title: 'Title', text: 'Text' });

    expect(result).toHaveProperty('script');
    expect(result).toHaveProperty('model');
    expect(result).toHaveProperty('thinkingModel');
    expect(result).toHaveProperty('provider');
  });
});
