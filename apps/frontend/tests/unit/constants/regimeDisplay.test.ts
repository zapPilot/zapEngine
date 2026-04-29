import { describe, expect, it } from 'vitest';

import {
  getRegimeConfig,
  REGIME_DISPLAY_CONFIG,
} from '@/constants/regimeDisplay';

describe('regimeDisplay', () => {
  describe('REGIME_DISPLAY_CONFIG', () => {
    it('has entries for all five regime ids', () => {
      expect(REGIME_DISPLAY_CONFIG.ef.label).toBe('Extreme Fear');
      expect(REGIME_DISPLAY_CONFIG.f.label).toBe('Fear');
      expect(REGIME_DISPLAY_CONFIG.n.label).toBe('Neutral');
      expect(REGIME_DISPLAY_CONFIG.g.label).toBe('Greed');
      expect(REGIME_DISPLAY_CONFIG.eg.label).toBe('Extreme Greed');
    });
  });

  describe('getRegimeConfig', () => {
    it('returns config for known regime labels', () => {
      expect(getRegimeConfig('extreme_fear').label).toBe('Extreme Fear');
      expect(getRegimeConfig('greed').color).toBe('text-emerald-500');
    });

    it('returns neutral config for unknown label', () => {
      expect(getRegimeConfig('unknown').label).toBe('Neutral');
    });

    it('returns neutral config for empty string', () => {
      expect(getRegimeConfig('').label).toBe('Neutral');
    });
  });
});
