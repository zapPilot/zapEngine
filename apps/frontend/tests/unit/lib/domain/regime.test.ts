import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getDefaultQuoteForRegime,
  getRegimeColor,
  getRegimeConfig,
  getRegimeFromSentiment,
  getRegimeFromStatus,
  getRegimeLabel,
  REGIME_COLORS,
  REGIME_DISPLAY_CONFIG,
  REGIME_LABELS,
} from '@/lib/domain/regime';

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));

vi.mock('@/utils', () => ({
  logger: { warn: mockWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('getRegimeFromSentiment', () => {
  beforeEach(() => mockWarn.mockReset());

  it.each([
    [0, 'ef'],
    [25, 'ef'],
    [26, 'f'],
    [45, 'f'],
    [46, 'n'],
    [50, 'n'],
    [54, 'n'],
    [55, 'g'],
    [75, 'g'],
    [76, 'eg'],
    [100, 'eg'],
  ])('maps sentiment %i to regime %s', (value, expected) => {
    expect(getRegimeFromSentiment(value)).toBe(expected);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it.each([NaN, Number.POSITIVE_INFINITY, -1, 101])(
    'defaults invalid sentiment %s to neutral and warns',
    (value) => {
      expect(getRegimeFromSentiment(value)).toBe('n');
      expect(mockWarn).toHaveBeenCalledTimes(1);
    },
  );
});

describe('getRegimeFromStatus', () => {
  beforeEach(() => mockWarn.mockReset());

  it.each([
    ['Extreme Fear', 'ef'],
    ['fear', 'f'],
    ['  Neutral  ', 'n'],
    ['GREED', 'g'],
    ['extreme greed', 'eg'],
  ])('maps status %s to %s', (status, expected) => {
    expect(getRegimeFromStatus(status)).toBe(expected);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('defaults nullish status to neutral without warning', () => {
    expect(getRegimeFromStatus(null)).toBe('n');
    expect(getRegimeFromStatus(undefined)).toBe('n');
    expect(getRegimeFromStatus('')).toBe('n');
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('warns and defaults to neutral for an unknown status', () => {
    expect(getRegimeFromStatus('euphoria')).toBe('n');
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });
});

describe('getRegimeColor', () => {
  it('returns the fallback for nullish input', () => {
    expect(getRegimeColor(null)).toBe('#eab308');
    expect(getRegimeColor(undefined, '#000000')).toBe('#000000');
  });

  it('resolves a RegimeId', () => {
    expect(getRegimeColor('ef')).toBe(REGIME_COLORS.ef);
  });

  it('resolves a RegimeLabel', () => {
    expect(getRegimeColor('extreme_greed')).toBe(REGIME_COLORS.eg);
  });

  it('returns the fallback for an unknown regime', () => {
    expect(getRegimeColor('nope', '#ffffff')).toBe('#ffffff');
  });
});

describe('getRegimeLabel', () => {
  it('returns an empty string for nullish or unknown input', () => {
    expect(getRegimeLabel(null)).toBe('');
    expect(getRegimeLabel('mystery')).toBe('');
  });

  it('resolves RegimeId and RegimeLabel forms', () => {
    expect(getRegimeLabel('g')).toBe(REGIME_LABELS.g);
    expect(getRegimeLabel('extreme_fear')).toBe(REGIME_LABELS.ef);
  });
});

describe('getRegimeConfig', () => {
  it('defaults to neutral for nullish or unknown input', () => {
    expect(getRegimeConfig(null)).toBe(REGIME_DISPLAY_CONFIG.n);
    expect(getRegimeConfig('???')).toBe(REGIME_DISPLAY_CONFIG.n);
  });

  it('resolves RegimeId and RegimeLabel forms', () => {
    expect(getRegimeConfig('eg')).toBe(REGIME_DISPLAY_CONFIG.eg);
    expect(getRegimeConfig('fear')).toBe(REGIME_DISPLAY_CONFIG.f);
  });
});

describe('getDefaultQuoteForRegime', () => {
  it('returns the configured quote for each regime', () => {
    expect(getDefaultQuoteForRegime('ef')).toContain('panic');
    expect(getDefaultQuoteForRegime('n')).toContain('balanced');
    expect(getDefaultQuoteForRegime('eg')).toContain('optimism');
  });
});
