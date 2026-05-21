import { describe, expect, it } from 'vitest';

import {
  BacktestCompareParamsV3Schema,
  BacktestMacroFearGreedSnapshotSchema,
  BacktestRequestSchema,
  BacktestRuleGroupSchema,
  BacktestSignalParamsV3Schema,
  BacktestSignalSchema,
  BacktestSpotAssetSymbolSchema,
  BacktestStrategyPortfolioSchema,
} from '../../../src/strategy/backtesting.js';

describe('BacktestSpotAssetSymbolSchema', () => {
  it('accepts the three supported spot assets', () => {
    for (const s of ['BTC', 'ETH', 'SPY']) {
      expect(BacktestSpotAssetSymbolSchema.safeParse(s).success).toBe(true);
    }
  });

  it('is case-sensitive (catches accidental lowercase drift)', () => {
    expect(BacktestSpotAssetSymbolSchema.safeParse('btc').success).toBe(false);
  });
});

describe('BacktestRuleGroupSchema', () => {
  it('accepts every documented rule group', () => {
    for (const g of [
      'cross',
      'cooldown',
      'dma_fgi',
      'ath',
      'rotation',
      'none',
    ]) {
      expect(BacktestRuleGroupSchema.safeParse(g).success).toBe(true);
    }
  });

  it('rejects unknown rule groups', () => {
    expect(BacktestRuleGroupSchema.safeParse('experimental').success).toBe(
      false,
    );
  });
});

describe('BacktestRequestSchema', () => {
  it('accepts a minimal request with one config', () => {
    expect(
      BacktestRequestSchema.safeParse({
        total_capital: 10000,
        configs: [{ config_id: 'cfg' }],
      }).success,
    ).toBe(true);
  });

  it('rejects an empty configs array (min 1)', () => {
    expect(
      BacktestRequestSchema.safeParse({
        total_capital: 10000,
        configs: [],
      }).success,
    ).toBe(false);
  });

  it('rejects non-positive total_capital', () => {
    expect(
      BacktestRequestSchema.safeParse({
        total_capital: 0,
        configs: [{ config_id: 'cfg' }],
      }).success,
    ).toBe(false);
  });
});

describe('BacktestSignalSchema', () => {
  it('accepts a signal with confidence in [0,1]', () => {
    expect(
      BacktestSignalSchema.safeParse({
        id: 'sig-1',
        regime: 'bull',
        confidence: 0.85,
      }).success,
    ).toBe(true);
  });

  it('rejects confidence > 1', () => {
    expect(
      BacktestSignalSchema.safeParse({
        id: 'sig-1',
        regime: 'bull',
        confidence: 1.01,
      }).success,
    ).toBe(false);
  });

  it('rejects negative confidence', () => {
    expect(
      BacktestSignalSchema.safeParse({
        id: 'sig-1',
        regime: 'bull',
        confidence: -0.01,
      }).success,
    ).toBe(false);
  });
});

describe('BacktestMacroFearGreedSnapshotSchema', () => {
  it('accepts score within [0,100]', () => {
    expect(
      BacktestMacroFearGreedSnapshotSchema.safeParse({
        score: 75,
        label: 'Greed',
        source: 'cnn',
        updated_at: '2026-05-21',
      }).success,
    ).toBe(true);
  });

  it('rejects score > 100', () => {
    expect(
      BacktestMacroFearGreedSnapshotSchema.safeParse({
        score: 101,
        label: 'Extreme Greed',
        source: 'cnn',
        updated_at: '2026-05-21',
      }).success,
    ).toBe(false);
  });
});

describe('BacktestStrategyPortfolioSchema', () => {
  it('accepts a portfolio with all nonnegative numeric fields', () => {
    expect(
      BacktestStrategyPortfolioSchema.safeParse({
        spot_usd: 1000,
        stable_usd: 500,
        total_value: 1500,
        allocation: { spot: 0.66, stable: 0.34 },
        asset_allocation: {
          btc: 0.3,
          eth: 0.3,
          spy: 0.1,
          stable: 0.3,
          alt: 0,
        },
      }).success,
    ).toBe(true);
  });

  it('rejects negative spot_usd', () => {
    expect(
      BacktestStrategyPortfolioSchema.safeParse({
        spot_usd: -1,
        stable_usd: 0,
        total_value: 0,
        allocation: { spot: 0, stable: 1 },
        asset_allocation: {
          btc: 0,
          eth: 0,
          spy: 0,
          stable: 1,
          alt: 0,
        },
      }).success,
    ).toBe(false);
  });
});

describe('BacktestSignalParamsV3Schema (strict + partial)', () => {
  it('accepts an empty params object', () => {
    expect(BacktestSignalParamsV3Schema.safeParse({}).success).toBe(true);
  });

  it('accepts a partial params object', () => {
    expect(
      BacktestSignalParamsV3Schema.safeParse({ cross_cooldown_days: 7 })
        .success,
    ).toBe(true);
  });

  it('rejects unknown keys (strict mode)', () => {
    expect(
      BacktestSignalParamsV3Schema.safeParse({ junk_param: true }).success,
    ).toBe(false);
  });
});

describe('BacktestCompareParamsV3Schema', () => {
  it('accepts a nested partial config', () => {
    expect(
      BacktestCompareParamsV3Schema.safeParse({
        signal: { cross_cooldown_days: 5 },
        disabled_rules: ['rule_a'],
      }).success,
    ).toBe(true);
  });

  it('rejects unknown top-level keys (strict)', () => {
    expect(
      BacktestCompareParamsV3Schema.safeParse({
        signal: {},
        new_unknown_section: {},
      }).success,
    ).toBe(false);
  });
});
