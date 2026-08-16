import { describe, expect, it } from 'vitest';

import {
  balancedSearchEvidenceGroups,
  createDeterministicStoryboard,
  createDeterministicStoryboardProvider,
} from './fallback.js';
import { splitCanonicalSentences } from './sentences.js';

function storyboard(input: {
  title: string;
  script: string;
  durationMs?: number;
  searchTitle?: string;
  searchScript?: string;
}) {
  const sentences = splitCanonicalSentences(input.script);
  return createDeterministicStoryboard({
    title: input.title,
    script: input.script,
    durationMs: input.durationMs ?? Math.max(9_000, sentences.length * 10_000),
    sentences,
    ...(input.searchTitle === undefined ? {} : { searchTitle: input.searchTitle }),
    ...(input.searchScript === undefined ? {} : { searchScript: input.searchScript }),
  });
}

describe('balancedSearchEvidenceGroups', () => {
  it('returns null for blank search evidence', () => {
    expect(balancedSearchEvidenceGroups('', 3)).toBeNull();
    expect(balancedSearchEvidenceGroups('   \n ', 3)).toBeNull();
  });

  it('groups existing sentences when enough sentence boundaries exist', () => {
    const groups = balancedSearchEvidenceGroups(
      'Alpha is short. Beta contains substantially more explanatory words. Gamma closes.',
      2,
    );

    expect(groups).toHaveLength(2);
    expect(groups?.join(' ')).toContain('Alpha');
    expect(groups?.join(' ')).toContain('Gamma');
  });

  it('falls back from sentences to word units when the English script has no punctuation', () => {
    expect(balancedSearchEvidenceGroups('alpha beta gamma delta', 3)).toEqual([
      'alpha',
      'beta gamma',
      'delta',
    ]);
  });

  it('falls back to character units and repeats the closest unit when groups outnumber units', () => {
    expect(balancedSearchEvidenceGroups('@@', 3)).toEqual(['@', '@', '@']);
    expect(balancedSearchEvidenceGroups('x', 3)).toEqual(['x', 'x', 'x']);
  });

  it('moves a weighted boundary when a later candidate is closer to the target', () => {
    const groups = balancedSearchEvidenceGroups(
      'tiny. This middle sentence contains many many many many many words. end.',
      2,
    );
    expect(groups).toHaveLength(2);
    expect(groups?.join(' ')).toContain('middle sentence');
    expect(groups?.every((group) => group.length > 0)).toBe(true);
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

  it('uses a grounded photographic concept when the scene names one', () => {
    const result = storyboard({
      title: 'Quantum computing research',
      script:
        'Quantum scientists test qubits inside a laboratory. Engineers inspect quantum computing hardware.',
      durationMs: 20_000,
    });

    expect(result.scenes).toHaveLength(2);
    const combined = result.scenes[0]?.imageSearchIntent.join(' ') ?? '';
    expect(combined).toContain('laboratory photo');
    expect(combined).not.toContain('real world documentary editorial photo');
  });

  it('uses the generic editorial-photo fallback when no photographic concept matches', () => {
    const result = storyboard({
      title: 'Obscure marmalade ledger',
      script: 'Marmalade ledger entries changed. Citrus jars moved between shelves.',
      durationMs: 20_000,
    });

    expect(result.scenes[0]?.imageSearchIntent.join(' ')).toContain(
      'real world documentary editorial photo',
    );
  });

  it('keeps grounded percentages and removes invented title numbers', () => {
    const result = storyboard({
      title: 'USDC revenue 9999',
      script:
        'USDC revenue increased 15% during 2025. The payment network processed stablecoin transfers.',
      durationMs: 20_000,
    });

    const intents = result.scenes.flatMap((scene) => scene.imageSearchIntent);
    expect(intents.some((intent) => intent.includes('15%'))).toBe(true);
    expect(intents.every((intent) => !intent.includes('9999'))).toBe(true);
  });

  it('handles acronyms, technical connectors, bridge words, and noise words', () => {
    const result = storyboard({
      title: 'USDC C++ Node.js systems',
      script:
        'Today the USDC and ETH-USDC team uses C++ and Node.js for A/B testing. Engineers monitor API systems.',
      durationMs: 20_000,
    });

    const combined = result.scenes
      .flatMap((scene) => scene.imageSearchIntent)
      .join(' ');
    expect(combined).toMatch(/USDC|ETH-USDC/u);
    expect(combined.length).toBeGreaterThan(10);
    for (const scene of result.scenes) {
      for (const intent of scene.imageSearchIntent) {
        expect(Array.from(intent).length).toBeLessThanOrEqual(80);
        expect(intent.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('uses English search title/script when supplied and grounds numbers against canonical evidence', () => {
    const result = storyboard({
      title: '原始標題',
      searchTitle: ' Federal Reserve 9999 ',
      script: '聯準會在 2025 年開會。市場隨後重新定價。',
      searchScript:
        'Federal Reserve officials met in Washington during 9999. Markets repriced afterward.',
      durationMs: 20_000,
    });

    const combined = result.scenes
      .flatMap((scene) => scene.imageSearchIntent)
      .join(' ');
    expect(combined).toContain('Federal Reserve');
    expect(combined).not.toContain('9999');
  });

  it('falls back to canonical evidence when a truthy search script produces no groups', () => {
    const result = storyboard({
      title: 'Stablecoin payments',
      searchTitle: '   ',
      script: 'Stablecoin payment terminals appeared in stores. Merchants tested checkout systems.',
      searchScript: '   ',
      durationMs: 20_000,
    });

    expect(result.scenes.every((scene) => scene.imageSearchIntent.length > 0)).toBe(
      true,
    );
  });

  it('balances uneven canonical sentences across allowed scene counts', () => {
    const script = [
      'Short.',
      'This sentence contains substantially more spoken material and therefore carries much more weight than its neighbors.',
      'Tiny.',
      'Another long explanatory sentence provides enough language to influence the balancing penalty calculation.',
      'End.',
    ].join(' ');
    const result = storyboard({
      title: 'Weighted grouping',
      script,
      durationMs: 42_000,
    });

    expect(result.scenes.length).toBeGreaterThanOrEqual(4);
    expect(result.scenes.at(-1)?.endSentenceId).toBe('s0005');
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
    const provider = createDeterministicStoryboardProvider({
      searchTitle: 'Federal Reserve meeting',
      searchScript: 'Federal Reserve officials meet. Financial markets react.',
    });

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
