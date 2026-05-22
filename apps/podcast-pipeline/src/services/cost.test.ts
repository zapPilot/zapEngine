import { describe, expect, it } from 'vitest';

import {
  buildIngestSummary,
  buildUsageCostDetails,
  compactUsageCostLines,
  formatCostLine,
  formatUsage,
  formatUsd,
  nonZeroUsageCostLines,
  presentCostBreakdown,
  sortUsageCostLinesByCostDesc,
  sumUsageCostLines,
  type UsageCostLine,
} from './cost.js';

const baseLine = (overrides: Partial<UsageCostLine> = {}): UsageCostLine => ({
  category: 'llm',
  label: 'LLM classrooms',
  provider: 'test-provider',
  model: 'test-model',
  costUsd: 0.00027,
  ...overrides,
});

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

describe('sortUsageCostLinesByCostDesc', () => {
  it('sorts lines by cost descending', () => {
    const lines = [
      {
        category: 'llm' as const,
        label: 'low',
        provider: 'p',
        model: 'm',
        costUsd: 0.01,
      },
      {
        category: 'tts' as const,
        label: 'high',
        provider: 'p',
        model: 'm',
        costUsd: 0.09,
      },
      {
        category: 'translate' as const,
        label: 'middle',
        provider: 'p',
        model: 'm',
        costUsd: 0.04,
      },
    ];

    expect(
      sortUsageCostLinesByCostDesc(lines).map((line) => line.label),
    ).toEqual(['high', 'middle', 'low']);
  });

  it('does not mutate the input array', () => {
    const lines = [
      {
        category: 'llm' as const,
        label: 'low',
        provider: 'p',
        model: 'm',
        costUsd: 0.01,
      },
      {
        category: 'llm' as const,
        label: 'high',
        provider: 'p',
        model: 'm',
        costUsd: 0.09,
      },
    ];

    const result = sortUsageCostLinesByCostDesc(lines);

    expect(result).not.toBe(lines);
    expect(lines.map((line) => line.label)).toEqual(['low', 'high']);
  });

  it('preserves relative order for equal cost lines', () => {
    const lines = [
      {
        category: 'llm' as const,
        label: 'first',
        provider: 'p',
        model: 'm',
        costUsd: 0.05,
      },
      {
        category: 'llm' as const,
        label: 'second',
        provider: 'p',
        model: 'm',
        costUsd: 0.05,
      },
      {
        category: 'llm' as const,
        label: 'third',
        provider: 'p',
        model: 'm',
        costUsd: 0.01,
      },
    ];

    expect(
      sortUsageCostLinesByCostDesc(lines).map((line) => line.label),
    ).toEqual(['first', 'second', 'third']);
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

describe('formatUsd', () => {
  it('renders 5 decimal places', () => {
    expect(formatUsd(0.00027)).toBe('0.00027');
    expect(formatUsd(0)).toBe('0.00000');
  });
});

describe('formatUsage', () => {
  it('relabels utf8_bytes to "UTF-8 bytes"', () => {
    expect(
      formatUsage({ unit: 'utf8_bytes', quantity: 12, unitPriceUsd: 0.000015 }),
    ).toBe('12 UTF-8 bytes @ $15.00000/M');
  });

  it('relabels characters to "chars"', () => {
    expect(
      formatUsage({ unit: 'characters', quantity: 5, unitPriceUsd: 0.00002 }),
    ).toBe('5 chars @ $20.00000/M');
  });

  it('passes other units through verbatim', () => {
    expect(
      formatUsage({ unit: 'tokens', quantity: 100, unitPriceUsd: 0.00001 }),
    ).toBe('100 tokens @ $10.00000/M');
  });
});

describe('formatCostLine', () => {
  it('renders a cost line without usage', () => {
    expect(formatCostLine(baseLine())).toBe(
      '- LLM classrooms (test-provider/test-model): $0.00027',
    );
  });

  it('appends usage when present', () => {
    expect(
      formatCostLine(
        baseLine({
          label: 'TTS main audio',
          provider: 'fish-audio',
          model: 's2-pro',
          costUsd: 0.00018,
          usage: { unit: 'utf8_bytes', quantity: 12, unitPriceUsd: 0.000015 },
        }),
      ),
    ).toBe(
      '- TTS main audio (fish-audio/s2-pro, 12 UTF-8 bytes @ $15.00000/M): $0.00018',
    );
  });
});

describe('presentCostBreakdown', () => {
  it('filters out zero-cost lines, compacts duplicates, then sorts desc', () => {
    const lines: UsageCostLine[] = [
      baseLine({ model: 'low', costUsd: 0.00001 }),
      baseLine({ model: 'high', costUsd: 0.00009 }),
      baseLine({ model: 'noop', costUsd: 0 }),
      baseLine({ model: 'middle', costUsd: 0.00004 }),
    ];
    const result = presentCostBreakdown(lines);
    expect(result.map((l) => l.model)).toEqual(['high', 'middle', 'low']);
  });

  it('returns [] for an all-zero breakdown', () => {
    expect(presentCostBreakdown([baseLine({ costUsd: 0 })])).toEqual([]);
  });
});

describe('buildIngestSummary', () => {
  it('renders status, title, hls, and cost breakdown', () => {
    expect(
      buildIngestSummary({
        status: 200,
        title: 'Localization title',
        hlsUrl: 'https://cdn.example.com/playlist.m3u8',
        costDetails: {
          totalUsd: 0.00027,
          breakdown: [baseLine()],
        },
      }),
    ).toBe(
      [
        '✅ 已存在',
        '《Localization title》',
        'https://cdn.example.com/playlist.m3u8',
        '💰 Total $0.00027',
        'Breakdown',
        '- LLM classrooms (test-provider/test-model): $0.00027',
      ].join('\n'),
    );
  });

  it('uses ✅ 完成 for status 201', () => {
    const out = buildIngestSummary({
      status: 201,
      title: 'X',
      hlsUrl: undefined,
      costDetails: { totalUsd: 0, breakdown: [] },
    });
    expect(out.startsWith('✅ 完成')).toBe(true);
  });

  it('omits the cost section when totalUsd is 0', () => {
    expect(
      buildIngestSummary({
        status: 200,
        title: 'X',
        hlsUrl: 'https://cdn.example.com/playlist.m3u8',
        costDetails: { totalUsd: 0, breakdown: [] },
      }),
    ).toBe(
      ['✅ 已存在', '《X》', 'https://cdn.example.com/playlist.m3u8'].join(
        '\n',
      ),
    );
  });

  it('skips the hls line when hlsUrl is empty/undefined', () => {
    expect(
      buildIngestSummary({
        status: 200,
        title: 'X',
        hlsUrl: '',
        costDetails: { totalUsd: 0, breakdown: [] },
      }),
    ).toBe(['✅ 已存在', '《X》'].join('\n'));
  });
});
