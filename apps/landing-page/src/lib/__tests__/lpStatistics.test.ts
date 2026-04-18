import { LP_STATISTICS } from '../lpStatistics';
import { CORE_STATS } from '../statistics';

describe('lpStatistics', () => {
  describe('LP_STATISTICS', () => {
    it('should include all CORE_STATS', () => {
      // LP_STATISTICS should contain all CORE_STATS plus LP-specific stats
      CORE_STATS.forEach(coreStat => {
        expect(LP_STATISTICS).toContainEqual(coreStat);
      });
    });

    it('should have Active LP Pairs stat', () => {
      const lpPairsStat = LP_STATISTICS.find(stat => stat.label === 'Active LP Pairs');

      expect(lpPairsStat).toBeDefined();
      expect(lpPairsStat?.type).toBe('icons');
    });

    it('should have BTC-USDC and ETH-USDC LP pairs', () => {
      const lpPairsStat = LP_STATISTICS.find(stat => stat.label === 'Active LP Pairs');

      expect(lpPairsStat?.icons).toHaveLength(2);
      expect(lpPairsStat?.icons?.[0].name).toBe('BTC-USDC');
      expect(lpPairsStat?.icons?.[1].name).toBe('ETH-USDC');
    });

    it('should have correct icon sources', () => {
      const lpPairsStat = LP_STATISTICS.find(stat => stat.label === 'Active LP Pairs');

      expect(lpPairsStat?.icons?.[0].src).toBe('/btc.webp');
      expect(lpPairsStat?.icons?.[1].src).toBe('/eth.webp');
    });

    it('should have more stats than CORE_STATS', () => {
      expect(LP_STATISTICS.length).toBeGreaterThan(CORE_STATS.length);
    });
  });
});
