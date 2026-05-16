import { describe, expect, it } from 'vitest';

import {
  buildUsageCostDetails,
  compactUsageCostLines,
  nonZeroUsageCostLines,
  sumUsageCostLines,
} from './cost.js';

describe('compactUsageCostLines', () => {
  it('groups lines with same key and sums costs', () => {
    const lines = [
      {
        category: 'llm' as const,
        label: 'chat',
        provider: 'openai',
        model: 'gpt-4',
        costUsd: 0.01,
        usage: { unit: 'tokens', quantity: 100, unitPriceUsd: 0.0001 },
      },
      {
        category: 'llm' as const,
        label: 'chat',
        provider: 'openai',
        model: 'gpt-4',
        costUsd: 0.02,
        usage: { unit: 'tokens', quantity: 200, unitPriceUsd: 0.0001 },
      },
    ];

    const result = compactUsageCostLines(lines);
    expect(result).toHaveLength(1);
    expect(result[0]!.costUsd).toBe(0.03);
    expect(result[0]!.usage!.quantity).toBe(300);
  });

  it('does not group lines with same key but different usage unit', () => {
    const lines = [
      {
        category: 'llm' as const,
        label: 'chat',
        provider: 'openai',
        model: 'gpt-4',
        costUsd: 0.01,
        usage: { unit: 'tokens', quantity: 100, unitPriceUsd: 0.0001 },
      },
      {
        category: 'llm' as const,
        label: 'chat',
        provider: 'openai',
        model: 'gpt-4',
        costUsd: 0.02,
        usage: { unit: 'characters', quantity: 200, unitPriceUsd: 0.0002 },
      },
    ];

    const result = compactUsageCostLines(lines);
    expect(result).toHaveLength(2);
  });
});

describe('nonZeroUsageCostLines', () => {
  it('filters out lines with zero cost', () => {
    const lines = [
      {
        category: 'llm' as const,
        label: 'a',
        provider: 'p',
        model: 'm',
        costUsd: 0,
      },
      {
        category: 'llm' as const,
        label: 'b',
        provider: 'p',
        model: 'm',
        costUsd: 0.01,
      },
      {
        category: 'llm' as const,
        label: 'c',
        provider: 'p',
        model: 'm',
        costUsd: 0,
      },
    ];

    expect(nonZeroUsageCostLines(lines)).toHaveLength(1);
    expect(nonZeroUsageCostLines(lines)[0]!.label).toBe('b');
  });
});

describe('sumUsageCostLines', () => {
  it('sums up all costs', () => {
    const lines = [
      {
        category: 'llm' as const,
        label: 'a',
        provider: 'p',
        model: 'm',
        costUsd: 0.01,
      },
      {
        category: 'llm' as const,
        label: 'b',
        provider: 'p',
        model: 'm',
        costUsd: 0.02,
      },
      {
        category: 'llm' as const,
        label: 'c',
        provider: 'p',
        model: 'm',
        costUsd: 0.03,
      },
    ];

    expect(sumUsageCostLines(lines)).toBe(0.06);
  });
});

describe('translate cost category', () => {
  it('sums a translate line into the total', () => {
    const details = buildUsageCostDetails([
      {
        category: 'translate' as const,
        label: 'Translation ja',
        provider: 'google',
        model: 'nmt',
        costUsd: 0.0123,
        usage: { unit: 'characters', quantity: 615, unitPriceUsd: 0.00002 },
      },
    ]);

    expect(details.totalUsd).toBeCloseTo(0.0123, 10);
    expect(details.breakdown[0]?.category).toBe('translate');
  });
});
