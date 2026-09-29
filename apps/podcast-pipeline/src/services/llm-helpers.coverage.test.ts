import { describe, expect, it } from 'vitest';

import {
  buildJsonModeChatParams,
  completionMetadata,
  messageReasoningCharacterCount,
  unwrapNestedJsonPayload,
} from './llm.js';

describe('LLM helper coverage', () => {
  it('builds JSON-mode params with and without optional request tuning', () => {
    const messages = [{ role: 'user' as const, content: 'hello' }];

    expect(buildJsonModeChatParams('model-a', messages)).toEqual({
      model: 'model-a',
      response_format: { type: 'json_object' },
      messages,
    });
    expect(
      buildJsonModeChatParams('model-b', messages, {
        temperature: 0.25,
        max_tokens: 123,
      }),
    ).toEqual({
      model: 'model-b',
      response_format: { type: 'json_object' },
      temperature: 0.25,
      max_tokens: 123,
      messages,
    });
  });

  it('counts direct and structured reasoning while ignoring malformed details', () => {
    expect(messageReasoningCharacterCount(null)).toBe(0);
    expect(messageReasoningCharacterCount({ reasoning: 'think' })).toBe(5);
    expect(messageReasoningCharacterCount({ reasoning_details: null })).toBe(0);
    expect(
      messageReasoningCharacterCount({
        reasoning_details: [
          null,
          'plain',
          { type: 'summary' },
          { text: 123 },
          { text: 'abc' },
          { text: 'de' },
        ],
      }),
    ).toBe(5);
  });

  it('normalizes completion metadata fallbacks and reported cost', () => {
    expect(
      completionMetadata(
        {
          id: 'id',
          object: 'chat.completion',
          created: 0,
          choices: [],
          model: '',
          provider: '',
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        } as never,
        'fallback-model',
        'thinking-model',
      ),
    ).toEqual({
      model: 'fallback-model',
      thinkingModel: 'thinking-model',
      provider: 'unknown',
      costUsd: 0,
    });

    expect(
      completionMetadata(
        {
          id: 'id',
          object: 'chat.completion',
          created: 0,
          choices: [],
          model: 'actual-model',
          provider: 'provider-a',
          usage: { cost: 1.25 },
        } as never,
        'fallback-model',
        null,
      ),
    ).toMatchObject({
      model: 'actual-model',
      provider: 'provider-a',
      costUsd: 1.25,
    });
  });

  it('unwraps nested JSON strings and leaves already-shaped or unusable values alone', () => {
    const alreadyShaped = { lessons: [] };
    expect(unwrapNestedJsonPayload(null, ['lessons'])).toBeNull();
    expect(unwrapNestedJsonPayload([], ['lessons'])).toEqual([]);
    expect(unwrapNestedJsonPayload(alreadyShaped, ['lessons'])).toBe(
      alreadyShaped,
    );

    expect(
      unwrapNestedJsonPayload(
        {
          meta: 1,
          bad: 'not-json',
          payload: '```json\n{"lessons":[{"id":1}]}\n```',
        },
        ['lessons'],
      ),
    ).toEqual({ lessons: [{ id: 1 }] });

    const unusable = { meta: 1, text: 'not-json' };
    expect(unwrapNestedJsonPayload(unusable, ['lessons'])).toBe(unusable);
  });
});
