import { describe, expect, it } from 'vitest';

import {
  createDeterministicStoryboard,
  createDeterministicStoryboardProvider,
  weightedSearchEvidenceGroups,
} from './fallback.js';
import { splitCanonicalSentences } from './sentences.js';

function storyboard(input: {
  title: string;
  script: string;
  durationMs?: number;
  sceneCountRange?: { min: number; max: number };
  searchTitle?: string;
  searchScript?: string;
}) {
  const sentences = splitCanonicalSentences(input.script);
  return createDeterministicStoryboard({
    title: input.title,
    script: input.script,
    durationMs: input.durationMs ?? Math.max(9_000, sentences.length * 10_000),
    sentences,
    ...(input.sceneCountRange
      ? { sceneCountRange: input.sceneCountRange }
      : {}),
    ...(input.searchTitle === undefined
      ? {}
      : { searchTitle: input.searchTitle }),
    ...(input.searchScript === undefined
      ? {}
      : { searchScript: input.searchScript }),
  });
}

describe('weightedSearchEvidenceGroups', () => {
  it('returns null for blank search evidence', () => {
    expect(weightedSearchEvidenceGroups('', [1, 1, 1])).toBeNull();
    expect(weightedSearchEvidenceGroups('   \n ', [1, 1, 1])).toBeNull();
  });

  it('groups existing sentences when enough sentence boundaries exist', () => {
    const groups = weightedSearchEvidenceGroups(
      'Alpha is short. Beta contains substantially more explanatory words. Gamma closes.',
      [1, 1],
    );

    expect(groups).toHaveLength(2);
    expect(groups?.join(' ')).toContain('Alpha');
    expect(groups?.join(' ')).toContain('Gamma');
  });

  it('falls back from sentences to word units when the English script has no punctuation', () => {
    expect(
      weightedSearchEvidenceGroups('alpha beta gamma delta', [1, 1, 1]),
    ).toEqual(['alpha', 'beta gamma', 'delta']);
  });

  it('falls back to character units and repeats the closest unit when groups outnumber units', () => {
    expect(weightedSearchEvidenceGroups('@@', [1, 1, 1])).toEqual([
      '@',
      '@',
      '@',
    ]);
    expect(weightedSearchEvidenceGroups('x', [1, 1, 1])).toEqual([
      'x',
      'x',
      'x',
    ]);
  });

  it('moves a weighted boundary when a later candidate is closer to the target', () => {
    const groups = weightedSearchEvidenceGroups(
      'tiny. This middle sentence contains many many many many many words. end.',
      [1, 1],
    );
    expect(groups).toHaveLength(2);
    expect(groups?.join(' ')).toContain('middle sentence');
    expect(groups?.every((group) => group.length > 0)).toBe(true);
  });

  it('maps English evidence using the actual relative scene weights', () => {
    const groups = weightedSearchEvidenceGroups(
      'Alpha opens. Beta expands. Gamma explains more. Delta closes.',
      [1, 3],
    );

    expect(groups).toEqual([
      'Alpha opens.',
      'Beta expands. Gamma explains more. Delta closes.',
    ]);
  });

  it('normalizes non-positive and non-finite group weights', () => {
    const groups = weightedSearchEvidenceGroups(
      'Alpha opens. Beta expands. Gamma closes.',
      [0, Number.NaN, -5],
    );
    expect(groups).toHaveLength(3);
    expect(groups?.join(' ')).toContain('Alpha opens.');
    expect(groups?.join(' ')).toContain('Gamma closes.');
  });
});

describe('createDeterministicStoryboard', () => {
  it('rejects an empty canonical sentence list', () => {
    expect(() =>
      createDeterministicStoryboard({
        title: 'Empty',
        script: '',
        durationMs: 10_000,
        sentences: [],
      }),
    ).toThrow('Cannot build a storyboard from an empty canonical script');
  });

  it.each([
    [
      'Quantum computing research',
      'Quantum scientists test qubits. Engineers inspect hardware.',
    ],
    [
      'Obscure marmalade ledger',
      'Marmalade ledger entries changed. Citrus jars moved.',
    ],
    [
      'USDC revenue 9999',
      'USDC revenue increased 15% during 2025. Payments improved.',
    ],
    [
      'USDC C++ Node.js',
      'USDC and ETH-USDC use C++ and Node.js. API systems change.',
    ],
    ['GPU launch', 'NVIDIA GPU ships. NVIDIA scales.'],
  ])('only segments scenes for %s', (title, script) => {
    const result = storyboard({ title, script, durationMs: 20_000 });
    expect(result.scenes.length).toBeGreaterThan(0);
    expect(
      result.scenes.every((scene) => scene.imageSearchIntent === undefined),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/photo|editorial|documentary/u);
  });

  it('prefers a semantic subject boundary over an equal-duration cut', () => {
    const script = [
      'NVIDIA builds GPU systems.',
      'Data centers install the accelerators.',
      'Wall Street banks finance new bonds.',
      'Cargo ports move freight shipments.',
    ].join(' ');
    const result = storyboard({
      title: 'AI infrastructure financing',
      script,
      sceneCountRange: { min: 3, max: 3 },
      durationMs: 24_000,
    });

    expect(result.scenes).toHaveLength(3);
    const sceneEndingAtSecondSentence = result.scenes.find(
      (scene) => scene.endSentenceId === 's0002',
    );
    expect(sceneEndingAtSecondSentence).toBeDefined();
    expect(
      result.scenes.some((scene) => {
        const start = Number(scene.startSentenceId.slice(1));
        const end = Number(scene.endSentenceId.slice(1));
        return start <= 2 && end >= 3;
      }),
    ).toBe(false);
  });

  it('keeps uneven narration inside the flexible scene-count safety envelope', () => {
    const script = [
      'Short.',
      'This sentence contains substantially more spoken material and therefore carries much more weight than its neighbors.',
      'Tiny.',
      'Another long explanatory sentence provides enough language to influence the balancing calculation.',
      'End.',
    ].join(' ');
    const result = storyboard({
      title: 'Weighted grouping',
      script,
      durationMs: 42_000,
    });

    expect(result.scenes.length).toBeGreaterThanOrEqual(3);
    expect(result.scenes.length).toBeLessThanOrEqual(5);
    expect(result.scenes.at(-1)?.endSentenceId).toBe('s0005');
  });

  it('handles zero speaking weight without dividing by zero', () => {
    const sentences = [
      { id: 'zero-a', index: 0, text: '', startOffset: 0, endOffset: 0 },
      { id: 'zero-b', index: 1, text: '', startOffset: 0, endOffset: 0 },
    ];
    const result = createDeterministicStoryboard({
      title: 'Zero weight fallback',
      script: '',
      durationMs: 20_000,
      sentences,
      isPackaged: false,
    });
    expect(result.scenes).toHaveLength(2);
  });

  it('sorts multiple splittable residual groups before meeting the minimum scene count', () => {
    const firstLong = Array.from({ length: 45 }, () => 'NVIDIA').join(' ');
    const secondLong = Array.from({ length: 45 }, () => 'Cargo').join(' ');
    const script = [
      'NVIDIA.',
      `${firstLong}.`,
      'Cargo.',
      `${secondLong}.`,
    ].join(' ');
    const result = storyboard({
      title: 'Residual group sorting',
      script,
      sceneCountRange: { min: 3, max: 6 },
      durationMs: 40_000,
    });
    expect(result.scenes).toHaveLength(3);
  });

  it('splits the largest residual group to meet the minimum scene count', () => {
    const script = [
      'This first sentence contains a very large amount of spoken material with many repeated explanatory words about ordinary marmalade ledgers and shelves and jars and inventory and record keeping for a long extended discussion that continues for quite a while.',
      'Tiny.',
      'Small.',
      'Brief.',
      'End.',
    ].join(' ');
    const result = storyboard({
      title: 'Plain inventory notes',
      script,
      sceneCountRange: { min: 3, max: 6 },
      durationMs: 40_000,
    });

    expect(result.scenes).toHaveLength(3);
    expect(result.scenes.map((scene) => scene.startSentenceId)).toEqual([
      's0001',
      's0002',
      's0004',
    ]);
  });

  it('falls back to sentence text when the supplied canonical indexes are reversed', () => {
    const sentences = [
      {
        id: 'custom-a',
        index: 1,
        text: 'Alpha fallback.',
        startOffset: 0,
        endOffset: 15,
      },
      {
        id: 'custom-b',
        index: 0,
        text: 'Beta fallback.',
        startOffset: 16,
        endOffset: 30,
      },
    ];
    const result = createDeterministicStoryboard({
      title: 'Fallback text',
      script: 'unrelated source text',
      durationMs: 10_000,
      sentences,
      isPackaged: false,
      sceneCountRange: { min: 1, max: 1 },
    });
    expect(result.scenes).toHaveLength(1);
    expect(result.scenes[0]?.imageSearchIntent).toBeUndefined();
  });

  it('uses supplied packaging mode and falls back to sentence text when canonical ids do not resolve', () => {
    const sentences = [
      {
        id: 'custom-a',
        index: 0,
        text: 'Custom first sentence.',
        startOffset: 0,
        endOffset: 22,
      },
      {
        id: 'custom-b',
        index: 1,
        text: 'Custom second sentence.',
        startOffset: 23,
        endOffset: 46,
      },
    ];

    const packaged = createDeterministicStoryboard({
      title: 'Custom',
      script: 'Different script text.',
      durationMs: 20_000,
      sentences,
      isPackaged: true,
    });
    const unpackaged = createDeterministicStoryboard({
      title: 'Custom',
      script: 'Different script text.',
      durationMs: 20_000,
      sentences,
      isPackaged: false,
    });

    expect(packaged.scenes.length).toBeGreaterThan(0);
    expect(unpackaged.scenes.length).toBeGreaterThan(0);
    expect(
      packaged.scenes.every((scene) => scene.imageSearchIntent === undefined),
    ).toBe(true);
  });
});

describe('createDeterministicStoryboardProvider', () => {
  it('returns stable provenance and accepts English search-context overrides', async () => {
    const script = '第一句談聯準會。第二句談市場。';
    const request = {
      title: '原始標題',
      script,
      durationMs: 20_000,
      sentences: splitCanonicalSentences(script),
    };
    const provider = createDeterministicStoryboardProvider();

    expect(provider.name).toBe('deterministic');
    expect(provider.model).toBe('deterministic-v1');
    await expect(provider.generate(request)).resolves.toMatchObject({
      model: 'deterministic-v1',
      usage: null,
      draft: { scenes: expect.any(Array) },
    });
  });

  it('works with the default empty search context', async () => {
    const script = 'First sentence. Second sentence.';
    const provider = createDeterministicStoryboardProvider();
    const result = await provider.generate({
      title: 'Default context',
      script,
      durationMs: 20_000,
      sentences: splitCanonicalSentences(script),
    });
    expect(result.draft).toEqual(
      createDeterministicStoryboard({
        title: 'Default context',
        script,
        durationMs: 20_000,
        sentences: splitCanonicalSentences(script),
      }),
    );
  });
});
