import { describe, expect, it } from 'vitest';

import {
  getRegimeAllocation,
  getRegimeById,
  type Regime,
  regimes,
  type RegimeStrategy,
} from '../../../../../src/components/wallet/regime/regimeData';

describe('regimeData Validation', () => {
  it('should have valid philosophy and author on all strategies', () => {
    for (const regime of regimes) {
      // Check specific strategies based on type guards or property checks
      if (regime.strategies.fromLeft) {
        expect(regime.strategies.fromLeft.philosophy).toBeDefined();
        expect(regime.strategies.fromLeft.author).toBeDefined();
        expect(typeof regime.strategies.fromLeft.philosophy).toBe('string');
        expect(typeof regime.strategies.fromLeft.author).toBe('string');
      }

      if (regime.strategies.fromRight) {
        expect(regime.strategies.fromRight.philosophy).toBeDefined();
        expect(regime.strategies.fromRight.author).toBeDefined();
        expect(typeof regime.strategies.fromRight.philosophy).toBe('string');
        expect(typeof regime.strategies.fromRight.author).toBe('string');
      }

      // Check default only if it exists (TS Union checking)
      if ('default' in regime.strategies && regime.strategies.default) {
        const strat = regime.strategies.default as RegimeStrategy;
        expect(strat.philosophy).toBeDefined();
        expect(strat.author).toBeDefined();
        expect(typeof strat.philosophy).toBe('string');
        expect(typeof strat.author).toBe('string');
      }
    }
  });

  it("should enforce mutual exclusivity: strategies should not have 'default' if 'fromLeft'/'fromRight' are present", () => {
    for (const regime of regimes) {
      const hasDirectional =
        'fromLeft' in regime.strategies || 'fromRight' in regime.strategies;
      const hasDefault = 'default' in regime.strategies;

      if (hasDirectional) {
        expect(hasDefault).toBe(false);
      } else {
        expect(hasDefault).toBe(true);
      }
    }
  });

  it('should valid visual configuration on all regimes', () => {
    for (const regime of regimes) {
      expect(regime.visual).toBeDefined();
      expect(regime.visual.badge).toBeDefined();
      expect(regime.visual.gradient).toBeDefined();
      expect(regime.visual.icon).toBeDefined();
    }
  });
});

describe('getRegimeById', () => {
  it('should return correct regime for valid IDs', () => {
    const extremeFear = getRegimeById('ef');
    expect(extremeFear.id).toBe('ef');
    expect(extremeFear.label).toBe('Extreme Fear');

    const fear = getRegimeById('f');
    expect(fear.id).toBe('f');
    expect(fear.label).toBe('Fear');

    const neutral = getRegimeById('n');
    expect(neutral.id).toBe('n');
    expect(neutral.label).toBe('Neutral');

    const greed = getRegimeById('g');
    expect(greed.id).toBe('g');
    expect(greed.label).toBe('Greed');

    const extremeGreed = getRegimeById('eg');
    expect(extremeGreed.id).toBe('eg');
    expect(extremeGreed.label).toBe('Extreme Greed');
  });

  it('should return neutral regime when regime ID is not found', () => {
    // Force an invalid ID to test the fallback
    const result = getRegimeById('invalid' as any);
    expect(result.id).toBe('n');
    expect(result.label).toBe('Neutral');
  });

  it('should throw error when neutral regime is missing from array', () => {
    // This tests the critical error path when even the neutral fallback is missing
    // We need to temporarily modify the regimes array to test this

    const originalRegimes = [...regimes];
    const regimesWithoutNeutral = regimes.filter((r) => r.id !== 'n');

    // Temporarily replace the regimes array
    regimes.length = 0;
    regimes.push(...regimesWithoutNeutral);

    expect(() => {
      getRegimeById('invalid' as any);
    }).toThrow('Critical: Neutral regime not found in regimes array');

    // Restore original regimes
    regimes.length = 0;
    regimes.push(...originalRegimes);
  });
});

describe('getRegimeAllocation', () => {
  it('should return allocation for regime with default strategy', () => {
    const neutralRegime = getRegimeById('n');
    const allocation = getRegimeAllocation(neutralRegime);

    expect(allocation).toEqual({
      spot: 50,
      stable: 50,
    });
  });

  it('should return allocation for regime with fromLeft strategy', () => {
    const fearRegime = getRegimeById('f');
    const allocation = getRegimeAllocation(fearRegime);

    expect(allocation).toBeDefined();
    expect(allocation.spot).toBeDefined();
    expect(allocation.stable).toBeDefined();
    expect(allocation.spot + allocation.stable).toBe(100);
  });

  it('should throw error when regime has no valid strategy with allocation', () => {
    // Create a mock regime with no valid allocation
    const invalidRegime: Regime = {
      id: 'test' as any,
      label: 'Test',
      fillColor: '#000000',
      visual: {
        badge: 'test',
        gradient: 'test',
        icon: regimes[0].visual.icon,
      },
      strategies: {
        default: {
          philosophy: 'Test',
          author: 'Test',
          // No useCase, so no allocation
        },
      },
    };

    expect(() => {
      getRegimeAllocation(invalidRegime);
    }).toThrow(
      'Critical: No valid strategy found for regime test to determine allocation',
    );
  });

  it('should handle regime with fromLeft but no useCase', () => {
    const invalidRegime: Regime = {
      id: 'test' as any,
      label: 'Test',
      fillColor: '#000000',
      visual: {
        badge: 'test',
        gradient: 'test',
        icon: regimes[0].visual.icon,
      },
      strategies: {
        fromLeft: {
          philosophy: 'Test',
          author: 'Test',
        },
        fromRight: {
          philosophy: 'Test',
          author: 'Test',
        },
      },
    };

    expect(() => {
      getRegimeAllocation(invalidRegime);
    }).toThrow(
      'Critical: No valid strategy found for regime test to determine allocation',
    );
  });

  it('should return correct allocations for all valid regimes', () => {
    for (const regime of regimes) {
      const allocation = getRegimeAllocation(regime);

      expect(allocation).toBeDefined();
      expect(allocation.spot).toBeGreaterThanOrEqual(0);
      expect(allocation.stable).toBeGreaterThanOrEqual(0);
      expect(allocation.spot + allocation.stable).toBe(100);
    }
  });

  it('should not reference liquidity pools in regime narratives', () => {
    for (const regime of regimes) {
      const strategies = Object.values(regime.strategies);

      for (const strategy of strategies) {
        expect(strategy.useCase?.zapAction ?? '').not.toMatch(
          /liquidity pool/i,
        );
        expect(strategy.useCase?.zapAction ?? '').not.toMatch(/\blp\b/i);
      }
    }
  });
});
