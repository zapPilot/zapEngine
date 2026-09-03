import { beforeEach, describe, expect, it, vi } from 'vitest';

const llm = vi.hoisted(() => ({
  openai: { marker: 'openai-client' },
  getOpenRouterConfig: vi.fn(),
  createCompletionWithRetry: vi.fn(),
}));

vi.mock('../../llm.js', () => ({
  getOpenRouterConfig: llm.getOpenRouterConfig,
  createCompletionWithRetry: llm.createCompletionWithRetry,
}));

import {
  buildConceptCardSystemPrompt,
  type ConceptCardCopyRequest,
  createOpenRouterConceptCardCopyProvider,
  deterministicConceptCardCopy,
  validateConceptCardCopy,
  writeConceptCardCopy,
} from './slide-copy.js';

const evidence =
  'The Bank of Japan raised rates by 25 bps while the yen strengthened against the dollar.';

function request(
  overrides: Partial<ConceptCardCopyRequest> = {},
): ConceptCardCopyRequest {
  return {
    title: 'Bank of Japan ends negative rates',
    evidence,
    entities: ['Bank of Japan'],
    intent: ['Bank of Japan headquarters press room'],
    lead: true,
    ...overrides,
  };
}

function validCopy(overrides: Record<string, unknown> = {}) {
  return {
    kicker: 'CONCEPT',
    headline: 'Bank of Japan rate hike',
    points: ['Rates up 25 bps', 'Yen strengthens vs dollar'],
    ...overrides,
  };
}

function provider(
  complete: (request: ConceptCardCopyRequest) => Promise<{
    value: unknown;
    costUsd: number | null;
  }>,
  model = 'test/copy-model',
) {
  return { model, complete: vi.fn(complete) };
}

beforeEach(() => {
  llm.getOpenRouterConfig.mockReset();
  llm.createCompletionWithRetry.mockReset();
  llm.getOpenRouterConfig.mockReturnValue({
    openai: llm.openai,
    model: 'openrouter/test-model',
    thinkingModel: null,
  });
});

describe('validateConceptCardCopy', () => {
  it('accepts grounded English copy', () => {
    expect(validateConceptCardCopy(validCopy(), request())).toEqual({
      kicker: 'CONCEPT',
      headline: 'Bank of Japan rate hike',
      points: ['Rates up 25 bps', 'Yen strengthens vs dollar'],
    });
  });

  it('trims whitespace and drops blank or non-string points', () => {
    expect(
      validateConceptCardCopy(
        validCopy({
          kicker: '  CONCEPT ',
          headline: ' Bank of Japan rate hike ',
          points: [' Rates up 25 bps ', '', 42, 'Yen strengthens vs dollar'],
        }),
        request(),
      ),
    ).toEqual({
      kicker: 'CONCEPT',
      headline: 'Bank of Japan rate hike',
      points: ['Rates up 25 bps', 'Yen strengthens vs dollar'],
    });
  });

  it.each([
    ['null', null],
    ['a string', 'CONCEPT'],
    ['an array', [validCopy()]],
    ['a number', 12],
  ])('rejects %s', (_label, value) => {
    expect(validateConceptCardCopy(value, request())).toBeNull();
  });

  it.each([
    ['missing kicker', validCopy({ kicker: undefined })],
    ['non-string kicker', validCopy({ kicker: 7 })],
    ['blank kicker', validCopy({ kicker: '   ' })],
    ['CJK kicker', validCopy({ kicker: '概念' })],
    ['kicker over 24 characters', validCopy({ kicker: 'C'.repeat(25) })],
    ['missing headline', validCopy({ headline: undefined })],
    ['CJK headline', validCopy({ headline: 'Bank of Japan 升息' })],
    ['one-word headline', validCopy({ headline: 'Japan' })],
    [
      'eight-word headline',
      validCopy({ headline: 'Bank of Japan rate hike a b c' }),
    ],
    [
      'headline over 42 characters',
      validCopy({
        headline: 'Bank of Japan extraordinarily unprecedented tightening',
      }),
    ],
    ['points not an array', validCopy({ points: 'Rates up 25 bps' })],
    ['a single point', validCopy({ points: ['Rates up 25 bps'] })],
    [
      'four points',
      validCopy({
        points: ['Rates up', 'Yen up', 'Yen up again', 'Yen up more'],
      }),
    ],
    [
      'a nine-word point',
      validCopy({ points: ['Rates up 25 bps a b c d e', 'Yen up'] }),
    ],
    [
      'a point over 48 characters',
      validCopy({
        points: [
          'Rates strengthened unprecedentedly extraordinarily today',
          'Yen up',
        ],
      }),
    ],
    ['a CJK point', validCopy({ points: ['Rates up 25 bps', '日圓走強'] })],
    [
      'an ungrounded number',
      validCopy({ points: ['Rates up 50 bps', 'Yen up'] }),
    ],
    [
      'an ungrounded capitalized entity',
      validCopy({ points: ['Rates up 25 bps', 'Powell reacts'] }),
    ],
  ])('rejects %s', (_label, value) => {
    expect(validateConceptCardCopy(value, request())).toBeNull();
  });

  it('requires the lead headline to name an entity when the scene has one', () => {
    const copy = validCopy({ headline: 'Rates climb again' });
    expect(validateConceptCardCopy(copy, request({ lead: true }))).toBeNull();
    expect(validateConceptCardCopy(copy, request({ lead: false }))).toEqual({
      kicker: 'CONCEPT',
      headline: 'Rates climb again',
      points: copy.points,
    });
    expect(
      validateConceptCardCopy(copy, request({ lead: true, entities: [] })),
    ).toEqual({
      kicker: 'CONCEPT',
      headline: 'Rates climb again',
      points: copy.points,
    });
  });

  it('grounds numbers with percent or multiplier suffixes and entities from intent or title', () => {
    const copy = validCopy({
      headline: 'Negative rates end for Japan',
      points: ['Inflation at 2.5% target', 'Headquarters press room briefing'],
    });
    const grounded = request({
      evidence: 'Inflation sits at the 2.5% target while negative rates end.',
      lead: false,
    });
    expect(validateConceptCardCopy(copy, grounded)).not.toBeNull();
    // "Headquarters" is only present in the intent and "Negative" only in the
    // title, both of which count as grounding material.
    expect(
      validateConceptCardCopy(
        copy,
        request({
          evidence: 'Inflation sits at the 2.5% target.',
          intent: [],
          lead: false,
        }),
      ),
    ).toBeNull();
  });
});

describe('deterministicConceptCardCopy', () => {
  it('leads with the first English entity and labels the lead scene', () => {
    expect(deterministicConceptCardCopy(request())).toEqual({
      kicker: 'LEAD CONCEPT',
      headline: 'Bank of Japan',
      points: [
        'The raised rates by 25 bps while',
        'Bank of Japan headquarters press room',
      ],
      source: 'deterministic',
      model: null,
      costUsd: null,
    });
  });

  it('falls back from entity to intent, then to title, then to a fixed headline', () => {
    const intentHeadline = deterministicConceptCardCopy(
      request({ entities: ['日本銀行'], lead: false }),
    );
    expect(intentHeadline.kicker).toBe('KEY CONCEPT');
    expect(intentHeadline.headline).toBe(
      'Bank of Japan headquarters press room',
    );

    const titleHeadline = deterministicConceptCardCopy(
      request({ entities: [], intent: ['日本銀行 總部'] }),
    );
    expect(titleHeadline.headline).toBe('Bank of Japan ends negative rates');
    expect(titleHeadline.points[1]).toBe('Bank of Japan ends negative rates');

    const fixedHeadline = deterministicConceptCardCopy(
      request({ entities: [], intent: [], title: '日本銀行結束負利率' }),
    );
    expect(fixedHeadline.headline).toBe('Key Point');
  });

  it('uses placeholder points when the evidence and intent carry no Latin words', () => {
    const copy = deterministicConceptCardCopy(
      request({
        entities: ['Bank of Japan'],
        evidence: '日本銀行升息二十五個基點。',
        intent: ['日本銀行 總部'],
        title: '日本銀行結束負利率',
      }),
    );
    expect(copy.points).toEqual(['Context at a glance', 'Visual summary']);
  });

  it('drops evidence words already used by the headline before building the first point', () => {
    const copy = deterministicConceptCardCopy(
      request({
        entities: ['Yen'],
        evidence: 'Yen yen YEN rallies sharply after the decision',
      }),
    );
    expect(copy.points[0]).toBe('rallies sharply after the decision');
  });

  it('compacts long headlines to seven words and 42 characters', () => {
    const sevenWords = deterministicConceptCardCopy(
      request({ entities: ['one two three four five six seven eight nine'] }),
    );
    expect(sevenWords.headline).toBe('one two three four five six seven');

    const charLimited = deterministicConceptCardCopy(
      request({
        entities: [
          'Extraordinarily unprecedented macroeconomic tightening cycle',
        ],
      }),
    );
    expect(charLimited.headline).toBe('Extraordinarily unprecedented');
    expect(charLimited.headline.length).toBeLessThanOrEqual(42);
  });
});

describe('writeConceptCardCopy', () => {
  it('returns validated LLM copy with the provider model and cost', async () => {
    const copyProvider = provider(async () => ({
      value: validCopy(),
      costUsd: 0.0021,
    }));

    await expect(
      writeConceptCardCopy(request(), { provider: copyProvider }),
    ).resolves.toEqual({
      kicker: 'CONCEPT',
      headline: 'Bank of Japan rate hike',
      points: ['Rates up 25 bps', 'Yen strengthens vs dollar'],
      source: 'llm',
      model: 'test/copy-model',
      costUsd: 0.0021,
    });
    expect(copyProvider.complete).toHaveBeenCalledWith(request());
  });

  it('falls back to deterministic copy when the LLM output fails validation', async () => {
    const copyProvider = provider(async () => ({
      value: validCopy({ headline: 'Japan' }),
      costUsd: 0.001,
    }));

    await expect(
      writeConceptCardCopy(request(), { provider: copyProvider }),
    ).resolves.toEqual(deterministicConceptCardCopy(request()));
  });

  it('falls back to deterministic copy when the provider throws', async () => {
    const copyProvider = provider(async () => {
      throw new Error('OpenRouter 502');
    });

    await expect(
      writeConceptCardCopy(request(), { provider: copyProvider }),
    ).resolves.toMatchObject({ source: 'deterministic', model: null });
  });

  it('throws before calling the provider when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('job cancelled'));
    const copyProvider = provider(async () => ({
      value: validCopy(),
      costUsd: null,
    }));

    await expect(
      writeConceptCardCopy(request({ signal: controller.signal }), {
        provider: copyProvider,
      }),
    ).rejects.toThrow('job cancelled');
    expect(copyProvider.complete).not.toHaveBeenCalled();
  });

  it('rethrows a provider error raised by an abort during the request', async () => {
    const controller = new AbortController();
    const copyProvider = provider(async () => {
      controller.abort(new Error('lease lost'));
      throw new Error('request aborted');
    });

    await expect(
      writeConceptCardCopy(request({ signal: controller.signal }), {
        provider: copyProvider,
      }),
    ).rejects.toThrow('request aborted');
  });

  it('does not accept copy that arrived after the signal aborted', async () => {
    const controller = new AbortController();
    const copyProvider = provider(async () => {
      controller.abort(new Error('lease lost'));
      return { value: validCopy(), costUsd: 0.001 };
    });

    await expect(
      writeConceptCardCopy(request({ signal: controller.signal }), {
        provider: copyProvider,
      }),
    ).rejects.toThrow('lease lost');
  });

  it('builds the OpenRouter provider when none is injected', async () => {
    llm.createCompletionWithRetry.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(validCopy()) } }],
      costUsd: 0.0007,
    });

    await expect(writeConceptCardCopy(request())).resolves.toMatchObject({
      source: 'llm',
      model: 'openrouter/test-model',
      costUsd: 0.0007,
    });
    expect(llm.getOpenRouterConfig).toHaveBeenCalledWith({
      thinkingModel: null,
    });
  });
});

describe('buildConceptCardSystemPrompt', () => {
  it('states the copy rules the validator enforces', () => {
    const prompt = buildConceptCardSystemPrompt();
    expect(prompt).toContain('English only');
    expect(prompt).toContain('2 to 7 words');
    expect(prompt).toContain('42 characters');
    expect(prompt).toContain('48 characters');
    expect(prompt).toContain('or investment advice');
    expect(prompt).toContain('lead=true');
    expect(prompt).toContain('Return JSON only');
  });
});

describe('createOpenRouterConceptCardCopyProvider', () => {
  it('sends a JSON-mode writeConceptCard completion and parses the reply', async () => {
    const controller = new AbortController();
    llm.createCompletionWithRetry.mockResolvedValue({
      choices: [{ message: { content: '{"kicker":"CONCEPT"}' } }],
      costUsd: 0.0042,
    });
    const copyProvider = createOpenRouterConceptCardCopyProvider();
    expect(copyProvider.model).toBe('openrouter/test-model');

    const result = await copyProvider.complete(
      request({ signal: controller.signal }),
    );

    expect(result).toEqual({ value: { kicker: 'CONCEPT' }, costUsd: 0.0042 });
    expect(llm.createCompletionWithRetry).toHaveBeenCalledWith(
      llm.openai,
      {
        model: 'openrouter/test-model',
        messages: [
          { role: 'system', content: buildConceptCardSystemPrompt() },
          {
            role: 'user',
            content: JSON.stringify({
              title: request().title,
              sceneEvidence: evidence,
              entities: ['Bank of Japan'],
              searchIntent: ['Bank of Japan headquarters press room'],
              lead: true,
            }),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 400,
      },
      null,
      'writeConceptCard',
      { signal: controller.signal, reasoning: { enabled: false } },
    );
  });

  it('omits the signal option when the request has none', async () => {
    llm.createCompletionWithRetry.mockResolvedValue({
      choices: [{ message: { content: '{}' } }],
    });

    const result =
      await createOpenRouterConceptCardCopyProvider().complete(request());

    expect(result).toEqual({ value: {}, costUsd: null });
    expect(llm.createCompletionWithRetry.mock.calls[0]?.[4]).toEqual({
      reasoning: { enabled: false },
    });
  });

  it('returns a null value when the reply is not JSON or has no choices', async () => {
    llm.createCompletionWithRetry.mockResolvedValueOnce({
      choices: [{ message: { content: 'not json' } }],
      costUsd: 'free',
    });
    llm.createCompletionWithRetry.mockResolvedValueOnce({ choices: [] });
    const copyProvider = createOpenRouterConceptCardCopyProvider();

    await expect(copyProvider.complete(request())).resolves.toEqual({
      value: null,
      costUsd: null,
    });
    await expect(copyProvider.complete(request())).resolves.toEqual({
      value: null,
      costUsd: null,
    });
  });
});
