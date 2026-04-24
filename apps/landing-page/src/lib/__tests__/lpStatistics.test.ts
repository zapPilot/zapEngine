import { STATISTICS } from '../statistics';

describe('statistics', () => {
  describe('STATISTICS', () => {
    it('should include the hero text stats', () => {
      expect(STATISTICS).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Total Value Locked',
            value: '$261k+',
            type: 'text',
          }),
        ]),
      );
    });

    it('should include the strategy signal chips', () => {
      const signalsStat = STATISTICS.find(
        (stat) => stat.label === 'Strategy Signals',
      );

      expect(signalsStat).toBeDefined();
      expect(signalsStat?.type).toBe('chips');
      expect(signalsStat?.chips).toEqual(['200MA', 'FGI', 'ETH/BTC']);
    });

    it('should include the core asset icons', () => {
      const coreAssetsStat = STATISTICS.find(
        (stat) => stat.label === 'Core Assets',
      );

      expect(coreAssetsStat).toBeDefined();
      expect(coreAssetsStat?.type).toBe('icons');
      expect(coreAssetsStat?.icons?.map((icon) => icon.name)).toEqual([
        'BTC',
        'ETH',
        'USDC',
      ]);
      expect(coreAssetsStat?.icons?.map((icon) => icon.src)).toEqual([
        '/btc.webp',
        '/eth.webp',
        '/usdc.webp',
      ]);
    });

    it('should include the integrated protocol icons', () => {
      const protocolsStat = STATISTICS.find(
        (stat) => stat.label === 'Integrated Protocols',
      );

      expect(protocolsStat).toBeDefined();
      expect(protocolsStat?.type).toBe('icons');
      expect(protocolsStat?.icons?.map((icon) => icon.name)).toEqual([
        'Morpho',
        'GMX',
        'Hyperliquid',
      ]);
    });
  });
});
